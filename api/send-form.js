import { PDFDocument } from "pdf-lib";
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import formidable from "formidable";

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  try {
    const form = formidable();
    const [fields] = await form.parse(req);

    const pdfPath = path.join(process.cwd(), "public/template.pdf");
    const existingPdfBytes = fs.readFileSync(pdfPath);
    console.log("PATH UTILITZAT:", pdfPath);
    console.log("PDF SIZE:", existingPdfBytes.length);

    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const pdfForm = pdfDoc.getForm();

    const safeSetText = (name, value) => {
      try { pdfForm.getTextField(name).setText(value ?? ""); } catch {}
    };

    const safeSelect = (name, value) => {
      try { pdfForm.getDropdown(name).select(value ?? ""); } catch {}
    };

    const safeCheck = (name, checked) => {
      try { if (checked) pdfForm.getCheckBox(name).check(); } catch {}
    };

    // =====================================================
    // 🔹 DADES PERSONALS
    // =====================================================

    safeSetText("Nom participant", fields.nom?.[0]);
    safeSetText("Cognoms participant", fields.cognoms?.[0]);
    safeSetText("Nom sentitat participant", fields.nomSentit?.[0]);
    safeSetText("Document d'identitat", fields.dni?.[0]);

    const rawDate = fields.dataNaixement?.[0] || "";
    let formattedDate = "";
    if (rawDate.includes("-")) {
      const [y, m, d] = rawDate.split("-");
      formattedDate = `${d}-${m}-${y}`;
    }
    safeSetText("Data de naixament", formattedDate);

    safeSetText("País d'origen", fields.paisOrigen?.[0]);
    safeSetText("NASS", fields.nass?.[0]);
    safeSetText("Adreça participant", fields.adrecaParticipant?.[0]);
    safeSetText("Comarca participant", fields.comarcaParticipant?.[0]);
    safeSetText("Població participant", fields.poblacioParticipant?.[0]);
    safeSetText("Codi postal particiapnt", fields.cpParticipant?.[0]);
    safeSetText("Correu electrònic participant", fields.email?.[0]);
    safeSetText("Telèfon", fields.telefon?.[0]);

    safeSelect("Gènere", fields.genere?.[0]);

    // =====================================================
    // 🔹 DADES PROFESSIONALS
    // =====================================================

    safeSelect("Interès a participar a l'acció formativa", fields.interes?.[0]);
    safeSelect("Estudis", fields.estudis?.[0]);
    safeSelect("Categoria professional (només persones ocuapdes)", fields.categoriaProfessional?.[0]);

    // =====================================================
    // 🔹 SITUACIÓ LABORAL
    // =====================================================

    const ocupat = fields.ocupat?.[0] === "true";
    safeCheck("Ocupatada Consigneuhi codi3", ocupat);

    if (ocupat && fields.codi3?.[0]) {
      safeSelect("Consigna", fields.codi3?.[0]);
    }

    safeCheck("Afectatada ERTO", fields.erto?.[0] === "true");
    safeCheck("Cuidadora no professionalCPN", fields.cpn?.[0] === "true");

    // =====================================================
    // 🔹 SITUACIONS ESPECÍFIQUES
    // =====================================================

    safeCheck("Diversitat funcional", fields.diversitat?.[0] === "true");
    safeCheck("Violència de gènere", fields.violencia?.[0] === "true");
    safeCheck("Víctima de terrorisme", fields.terrorisme?.[0] === "true");

    // =====================================================
    // 🔹 EMPRESA
    // =====================================================

    safeSetText("Rao social", fields.raoSocial?.[0]);
    safeSetText("CIF_empresa", fields.cif?.[0]);
    safeSetText("Núm. d’inscripció a la Seguretat Social", fields.nassEmpresa?.[0]);
    safeSetText("Adreça del centre de treball", fields.adrecaEmpresa?.[0]);
    safeSetText("Comarca empresa", fields.comarcaEmpresa?.[0]);
    safeSetText("Població empresa", fields.poblacioEmpresa?.[0]);
    safeSetText("Codi postal empresa", fields.cpEmpresa?.[0]);
    safeSelect("Mida de l'empresa", fields.midaEmpresa?.[0]);

    // =====================================================
    // 🔹 DECLARACIONS
    // =====================================================

    safeCheck("Declaro que he estat informatada per part de l", fields.declaro?.[0] === "on");
    safeCheck("Autoritzo al Consorci per a la Formació Contínua de Catalunya a utilitzar les meves dades personals per rebre informació sobre la formació professional per a l’ocupació", fields.autoritzacioDades?.[0] === "on");
    safeCheck("Autoritzo al Consorci per a la Formació Contínua de Catalunya a que la meva imatge/veu pugui sortir en fotografies i/o vídeos publicats a la seva web i/o a les seves xarxes socials", fields.autoritzacioImatge?.[0] === "on");

// ===============================
// 📄 OBTENIR PÀGINA 1
// ===============================
const page = pdfDoc.getPages()[0];

// ===============================
// ✍️ PREPARAR SIGNATURA
// ===============================
const sigB64 = (fields.signature?.[0] || "")
  .replace(/^data:image\/png;base64,/, "");

if (sigB64) {

  const pngImage = await pdfDoc.embedPng(sigB64);

  // 🔵 FIRMA ENTRE LES DUES LÍNIES NEGRES
  page.drawImage(pngImage, {
    x: 190,     // esquerra/dreta
    y: 185,     // amunt/avall  ⬅ pujada respecte abans
    width: 240,
    height: 75
  });
}


// ===============================
// 📍 DATA AL COSTAT DE "Lloc i data:"
// ===============================
const today = new Date();
const formattedDate =
  `${String(today.getDate()).padStart(2,'0')}-` +
  `${String(today.getMonth()+1).padStart(2,'0')}-` +
  today.getFullYear();

// 🟢 A la dreta del text "Lloc i data:"
page.drawText(`Barcelona, ${formattedDate}`, {
  x: 210,   // ajustat perquè quedi al costat del text
  y: 150,   // alineat amb la línia del text
  size: 11
});


// ===============================
// 💾 GUARDAR
// ===============================
pdfForm.updateFieldAppearances();
const pdfBytes = await pdfDoc.save();




    // =====================================================
    // 📧 EMAIL
    // =====================================================

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const subject = `Sol·licitud Projecta't (${fields.nom?.[0] || ""} ${fields.cognoms?.[0] || ""})`;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: "jalejo@fomentformacio.com",
      subject,
      attachments: [{
        filename: "solicitud-projectat.pdf",
        content: pdfBytes
      }]
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: fields.email?.[0],
      subject,
      text: "Adjunt tens el teu PDF signat.",
      attachments: [{
        filename: "solicitud-projectat.pdf",
        content: pdfBytes
      }]
    });

    res.status(200).json({ ok: true });

  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
}

