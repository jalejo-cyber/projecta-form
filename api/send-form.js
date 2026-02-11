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

    safeSetText("Nom", fields.nom?.[0]);
    safeSetText("Cognoms", fields.cognoms?.[0]);
    safeSetText("Correu electrònic", fields.email?.[0]);
    safeSetText("Telèfon", fields.telefon?.[0]);
    safeSetText("Document d'identitat", fields.dni?.[0]);
    safeSetText("Data de naixement", fields.dataNaixement?.[0]);

    safeSelect("Gènere", fields.genere?.[0]);

    const ocupat = fields.ocupat?.[0] === "true";
    safeCheck("Ocupat/ada", ocupat);
    if (ocupat) safeSelect("Codi3", fields.codi3?.[0]);

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
