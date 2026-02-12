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

    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const pdfForm = pdfDoc.getForm();

    const safeSetText = (fieldName, value) => {
      try { pdfForm.getTextField(fieldName).setText(value ?? ""); } catch {}
    };
    const safeSelect = (fieldName, value) => {
      try { pdfForm.getDropdown(fieldName).select(value ?? ""); } catch {}
    };
    const safeCheck = (fieldName, checked) => {
      try { if (checked) pdfForm.getCheckBox(fieldName).check(); } catch {}
    };

    // 🔹 DADES PARTICIPANT
    safeSetText("Nom participant", fields.nom?.[0]);
    safeSetText("Cognoms participant", fields.cognoms?.[0]);
    safeSetText("Correu electrònic participant", fields.email?.[0]);
    safeSetText("Telèfon", fields.telefon?.[0]);
    safeSetText("Document d'identitat", fields.dni?.[0]);
    safeSetText("Data de naixament", fields.dataNaixement?.[0]);

    safeSelect("Gènere", fields.genere?.[0]);

    // 🔹 SITUACIÓ LABORAL
    const ocupat = fields.ocupat?.[0] === "true";
    safeCheck("Ocupatada Consigneuhi codi3", ocupat);

    if (ocupat && fields.codi3?.[0]) {
      safeSelect("Consigna", fields.codi3?.[0]);
    }

    // 🔹 EMPRESA
    safeSetText("Rao social", fields.raoSocial?.[0]);
    safeSetText("CIF_empresa", fields.cif?.[0]);
    safeSetText("Núm. d’inscripció a la Seguretat Social", fields.nassEmpresa?.[0]);
    safeSetText("Adreça del centre de treball", fields.adrecaEmpresa?.[0]);
    safeSetText("Comarca empresa", fields.comarcaEmpresa?.[0]);
    safeSetText("Població empresa", fields.poblacioEmpresa?.[0]);
    safeSetText("Codi postal empresa", fields.cpEmpresa?.[0]);

    safeSelect("Mida de l'empresa", fields.midaEmpresa?.[0]);

    // 🔹 CHECKBOXES ESPECIALS
    safeCheck("Afectatada ERTO", fields.erto?.[0] === "true");
    safeCheck("Cuidadora no professionalCPN", fields.cpn?.[0] === "true");
    safeCheck("Diversitat funcional", fields.diversitat?.[0] === "true");
    safeCheck("Violència de gènere", fields.violencia?.[0] === "true");
    safeCheck("Víctima de terrorisme", fields.terrorisme?.[0] === "true");

    // 🔹 SIGNATURA (camp real del PDF)
    try {
      const signatureField = pdfForm.getSignature("Signatura");
      signatureField.enableReadOnly();
    } catch {}

    const sigB64 = (fields.signature?.[0] || "").replace(/^data:image\/png;base64,/, "");
    const sigImg = await pdfDoc.embedPng(sigB64);

    const page = pdfDoc.getPages()[0];

    page.drawImage(sigImg, {
      x: 60,
      y: 125,
      width: 220,
      height: 85
    });

    const today = new Date().toLocaleDateString("ca-ES");

    page.drawText(`Barcelona, ${today}`, {
      x: 60,
      y: 110,
      size: 11
    });

    const pdfBytes = await pdfDoc.save();

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
      text: `Hola!

T'enviem el PDF signat amb les teves dades. En breus t'escriurà una orientadora per programar la cita.

Salutacions i fins aviat.`,
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
