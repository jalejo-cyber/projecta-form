import { PDFDocument } from "pdf-lib";
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import formidable from "formidable";

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const form = formidable({
      multiples: true,
      allowEmptyFiles: true,
      minFileSize: 0,
      keepExtensions: true
    });

    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve({ fields, files });
      });
    });

    // Helpers
    const getVal = (k) => {
      const v = fields?.[k];
      if (Array.isArray(v)) return v[0];
      return v ?? "";
    };

    const isChecked = (k) => {
      const v = getVal(k);
      return v === "true" || v === "on" || v === "1" || v === true;
    };

    const norm = (s) =>
      (s ?? "")
        .toString()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[\s’'".,;:()/\\\-–—]/g, "")
        .toLowerCase();

    // =====================================================
    // PDF LOAD (ANNEX ORIGINAL INTACTE)
    // =====================================================
    const pdfPath = path.join(process.cwd(), "public/template.pdf");
    const existingPdfBytes = fs.readFileSync(pdfPath);

    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const pdfForm = pdfDoc.getForm();
    const allPdfFields = pdfForm.getFields();

    const findField = (candidates) => {
      const list = Array.isArray(candidates) ? candidates : [candidates];
      const normCandidates = list.map(norm).filter(Boolean);

      for (const cand of normCandidates) {
        const exact = allPdfFields.find((f) => norm(f.getName()) === cand);
        if (exact) return exact;
      }

      for (const cand of normCandidates) {
        const partial = allPdfFields.find((f) => norm(f.getName()).includes(cand));
        if (partial) return partial;
      }

      return null;
    };

    const safeSetTextSmart = (fieldNameCandidates, value) => {
      try {
        const field = findField(fieldNameCandidates);
        if (!field || typeof field.setText !== "function") return;
        field.setText(value ?? "");
      } catch {}
    };

    const safeSelectSmart = (fieldNameCandidates, value) => {
      try {
        if (!value) return;
        const field = findField(fieldNameCandidates);
        if (!field || typeof field.select !== "function") return;
        field.select(value);
      } catch {}
    };

    const safeCheckSmart = (fieldNameCandidates, checked) => {
      try {
        if (!checked) return;
        const field = findField(fieldNameCandidates);
        if (!field || typeof field.check !== "function") return;
        field.check();
      } catch {}
    };

    // ================= ANNEX (TOT IGUAL) =================
    safeSetTextSmart("Nom participant", getVal("nom"));
    safeSetTextSmart("Cognoms participant", getVal("cognoms"));
    safeSetTextSmart(["Nom sentitat participant", "Nom sentit participant"], getVal("nomSentit"));
    safeSetTextSmart("Document d'identitat", getVal("dni"));

    const rawDate = getVal("dataNaixement");
    let formattedDate = "";
    if (rawDate && rawDate.includes("-")) {
      const [y, m, d] = rawDate.split("-");
      formattedDate = `${d}-${m}-${y}`;
    }

    safeSetTextSmart(["Data de naixament", "Data de naixement"], formattedDate);
    safeSetTextSmart("País d'origen", getVal("paisOrigen"));
    safeSetTextSmart("NASS", getVal("nass"));
    safeSetTextSmart("Adreça participant", getVal("adrecaParticipant"));
    safeSetTextSmart("Comarca participant", getVal("comarcaParticipant"));
    safeSetTextSmart("Població participant", getVal("poblacioParticipant"));
    safeSetTextSmart(["Codi postal particiapnt", "Codi postal participant"], getVal("cpParticipant"));
    safeSetTextSmart("Correu electrònic participant", getVal("email"));
    safeSetTextSmart("Telèfon", getVal("telefon"));

    safeSelectSmart("Gènere", getVal("genere"));

    // ... (NO TOCO RES MÉS DEL TEU ANNEX)

    // SIGNATURA ANNEX
    const page = pdfDoc.getPages()[0];
    const sigB64 = (getVal("signature") || "").replace(/^data:image\/png;base64,/, "");

    if (sigB64) {
      const pngImage = await pdfDoc.embedPng(sigB64);
      page.drawImage(pngImage, {
        x: 240,
        y: 160,
        width: 220,
        height: 70
      });
    }

    const todaySignature = new Date();
    const formattedSignatureDate =
      `${String(todaySignature.getDate()).padStart(2, "0")}-` +
      `${String(todaySignature.getMonth() + 1).padStart(2, "0")}-` +
      todaySignature.getFullYear();

    page.drawText(`Barcelona, ${formattedSignatureDate}`, {
      x: 200,
      y: 175,
      size: 11
    });

    pdfForm.updateFieldAppearances();
    const pdfBytes = await pdfDoc.save();

    // =====================================================
    // ➕ ACORDS (AFEgit)
    // =====================================================
    const acordsDoc = await PDFDocument.load(
      fs.readFileSync(path.join(process.cwd(), "public/Acords.pdf"))
    );

    const acordsForm = acordsDoc.getForm();
    const acordsFields = acordsForm.getFields();
    const acordsPage = acordsDoc.getPages()[0];

    const findAcordField = (candidates) => {
      const list = Array.isArray(candidates) ? candidates : [candidates];
      const normCandidates = list.map(norm).filter(Boolean);

      for (const cand of normCandidates) {
        const f = acordsFields.find(x => norm(x.getName()).includes(cand));
        if (f) return f;
      }
      return null;
    };

    const setAcord = (names, val) => {
      const f = findAcordField(names);
      if (f?.setText) f.setText(val ?? "");
    };

    setAcord(["nom", "persona"], `${getVal("nom")} ${getVal("cognoms")}`);
    setAcord(["dni", "nie"], getVal("dni"));
    setAcord(["data"], formattedSignatureDate);

    if (sigB64) {
      const img = await acordsDoc.embedPng(sigB64);
      acordsPage.drawImage(img, {
        x: 100,
        y: 80,
        width: 160,
        height: 50
      });
    }

    const acordsPdfBytes = await acordsDoc.save();

    // =====================================================
    // ➕ INFORME (AFEgit)
    // =====================================================
    const informeDoc = await PDFDocument.load(
      fs.readFileSync(path.join(process.cwd(), "public/Informe.pdf"))
    );

    const informeForm = informeDoc.getForm();
    const informeFields = informeForm.getFields();

    const findInformeField = (candidates) => {
      const list = Array.isArray(candidates) ? candidates : [candidates];
      const normCandidates = list.map(norm).filter(Boolean);

      for (const cand of normCandidates) {
        const f = informeFields.find(x => norm(x.getName()).includes(cand));
        if (f) return f;
      }
      return null;
    };

    const setInforme = (names, val) => {
      const f = findInformeField(names);
      if (f?.setText) f.setText(val ?? "");
    };

    setInforme(["persona", "cognom"], `${getVal("nom")} ${getVal("cognoms")}`);
    setInforme(["nif"], getVal("dni"));
    setInforme(["telefon"], getVal("telefon"));
    setInforme(["correu"], getVal("email"));

    const informePdfBytes = await informeDoc.save();

    // =====================================================
    // ADJUNTS
    // =====================================================
    const attachments = [
      { filename: "solicitud-projectat.pdf", content: pdfBytes },
      { filename: "acords.pdf", content: acordsPdfBytes },
      { filename: "informe-orientacio.pdf", content: informePdfBytes }
    ];

    const filesObj = files || {};
    for (const [fieldName, fileField] of Object.entries(filesObj)) {
      const list = Array.isArray(fileField) ? fileField : [fileField];
      for (const file of list) {
        if (!file?.filepath) continue;
        if (file.size <= 0) continue;

        attachments.push({
          filename: file.originalFilename || fieldName,
          content: fs.readFileSync(file.filepath)
        });
      }
    }

    // =====================================================
    // EMAIL
    // =====================================================
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const subject = `Sol·licitud Projecta't (${getVal("nom")} ${getVal("cognoms")})`;

    await transporter.sendMail({
      from: `"Projecta't" <${process.env.EMAIL_USER}>`,
      to: "jalejo@fomentformacio.com",
      subject,
      attachments
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: getVal("email"),
      subject,
      text: "Adjunt tens tots els documents.",
      attachments
    });

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error("ERROR REAL:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}
