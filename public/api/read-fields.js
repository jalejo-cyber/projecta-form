import { PDFDocument } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

export const config = {
  api: { bodyParser: false }
};

export default async function handler(req, res) {
  try {
    const pdfPath = path.join(process.cwd(), 'public/1_Annex 1 - OP - CAT_v2.pdf');
    const existingPdfBytes = fs.readFileSync(pdfPath);

    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const form = pdfDoc.getForm();
    const fields = form.getFields();

    const fieldList = fields.map((field) => ({
      name: field.getName(),
      type: field.constructor.name
    }));

    res.status(200).json(fieldList);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
