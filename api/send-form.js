import { PDFDocument, StandardFonts } from "pdf-lib";
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

    // =====================================================
    // HELPERS
    // =====================================================
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

    const today = new Date();
    const formattedSignatureDate =
      `${String(today.getDate()).padStart(2, "0")}-` +
      `${String(today.getMonth() + 1).padStart(2, "0")}-` +
      today.getFullYear();

    const sigB64 = (getVal("signature") || "").replace(/^data:image\/png;base64,/, "");

    const nomComplet = `${getVal("nom")} ${getVal("cognoms")}`.trim();
    const dniNie = getVal("dni");

    // =====================================================
    // 1) PDF PRINCIPAL
    // =====================================================
    const pdfPath = path.join(process.cwd(), "public/template.pdf");
    const pdfDoc = await PDFDocument.load(fs.readFileSync(pdfPath));
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
        const partial = allPdfFields.find((f) =>
          norm(f.getName()).includes(cand)
        );
        if (partial) return partial;
      }

      return null;
    };

    const safeSetText = (names, value) => {
      const f = findField(names);
      if (f?.setText) f.setText(value ?? "");
    };

    const safeSelect = (names, value) => {
      const f = findField(names);
      if (f?.select && value) f.select(value);
    };

    const safeCheck = (names, checked) => {
      const f = findField(names);
      if (f?.check && checked) f.check();
    };

    // DADES
    safeSetText("Nom participant", getVal("nom"));
    safeSetText("Cognoms participant", getVal("cognoms"));
    safeSetText("Document d'identitat", dniNie);
    safeSetText("Correu electrònic participant", getVal("email"));
    safeSetText("Telèfon", getVal("telefon"));

    safeSelect("Gènere", getVal("genere"));

    // SIGNATURA
    const page = pdfDoc.getPages()[0];

    if (sigB64) {
      const img = await pdfDoc.embedPng(sigB64);
      page.drawImage(img, {
        x: 240,
        y: 160,
        width: 220,
        height: 70
      });
    }

    page.drawText(`Barcelona, ${formattedSignatureDate}`, {
      x: 200,
      y: 175,
      size: 11
    });

    pdfForm.updateFieldAppearances();
    const pdfBytes = await pdfDoc.save();

    // =====================================================
    // 2) ACORDS
    // =====================================================
    const acordsDoc = await PDFDocument.load(
      fs.readFileSync(path.join(process.cwd(), "public/Acords.pdf"))
    );
    const acordsForm = acordsDoc.getForm();
    const acordsPage = acordsDoc.getPages()[0];
    const font = await acordsDoc.embedFont(StandardFonts.Helvetica);

    const setAcord = (name, val) => {
      try {
        acordsForm.getTextField(name).setText(val);
      } catch {}
    };

    setAcord("Nom i cognom persona orientada", nomComplet);
    setAcord("DNI / NIE", dniNie);
    setAcord("Data", formattedSignatureDate);

    if (sigB64) {
      const img = await acordsDoc.embedPng(sigB64);
      acordsPage.drawImage(img, {
        x: 100,
        y: 80,
        width: 160,
        height: 50
      });
    }

    acordsForm.updateFieldAppearances(font);
    const acordsPdfBytes = await acordsDoc.save();

    // =====================================================
    // 3) INFORME
    // =====================================================
    const informeDoc = await PDFDocument.load(
      fs.readFileSync(path.join(process.cwd(), "public/Informe.pdf"))
    );
    const informeForm = informeDoc.getForm();

    const setInforme = (name, val) => {
      try {
        informeForm.getTextField(name).setText(val);
      } catch {}
    };

    setInforme("Nom i cognoms:", nomComplet);
    setInforme("NIF:", dniNie);
    setInforme("Telèfon de contacte:", getVal("telefon"));
    setInforme("Correu electrònic:", getVal("email"));

    informeForm.updateFieldAppearances();
    const informePdfBytes = await informeDoc.save();

    // =====================================================
    // ADJUNTS
    // =====================================================
    const attachments = [
      { filename: "solicitud-projectat.pdf", content: pdfBytes },
      { filename: "acords.pdf", content: acordsPdfBytes },
      { filename: "informe-orientacio.pdf", content: informePdfBytes }
    ];

    // afegir fitxers pujats
    for (const fileField of Object.values(files || {})) {
      const list = Array.isArray(fileField) ? fileField : [fileField];
      for (const f of list) {
        if (!f?.filepath || f.size <= 0) continue;
        attachments.push({
          filename: f.originalFilename,
          content: fs.readFileSync(f.filepath)
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

    const subject = `Sol·licitud Projecta't (${nomComplet})`;

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
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
