import { PDFDocument } from "pdf-lib";
import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  try {
    const pdfPath = path.join(process.cwd(), "public/template.pdf");
    const existingPdfBytes = fs.readFileSync(pdfPath);

    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const form = pdfDoc.getForm();
    const fields = form.getFields();

    const fieldData = fields.map(field => {
      return {
        name: field.getName(),
        type: field.constructor.name
      };
    });

    res.status(200).json(fieldData);

  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
}
