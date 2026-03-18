import { PDFDocument } from "pdf-lib";
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import formidable from "formidable";

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const form = formidable({
      multiples: true,
      allowEmptyFiles: true,
      minFileSize: 0,
      keepExtensions: true,
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

    // =====================================================
    // PDF LOAD
    // =====================================================
    const pdfPath = path.join(process.cwd(), "public/template.pdf");
    const existingPdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const pdfForm = pdfDoc.getForm();
    const allPdfFields = pdfForm.getFields();

    const norm = (s) =>
      (s ?? "")
        .toString()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") 
        .replace(/[\s’'".,;:()/\\\-–—]/g, "")
        .toLowerCase();

    const findField = (candidates) => {
      const list = Array.isArray(candidates) ? candidates : [candidates];
      const normCandidates = list.map(norm).filter(Boolean);

      for (const cand of normCandidates) {
        const exact = allPdfFields.find(
          (f) => norm(f.getName()) === cand
        );
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

    const safeSetTextSmart = (fieldNameCandidates, value) => {
      try {
        const field = findField(fieldNameCandidates);
        if (!field || typeof field.setText !== "function") {
          console.warn("[PDF] TextField no trobat per:", fieldNameCandidates);
          return;
        }
        field.setText(value ?? "");
      } catch (e) {
        console.warn("[PDF] Error setText:", fieldNameCandidates, e?.message);
      }
    };

    const safeSelectSmart = (fieldNameCandidates, value) => {
      try {
        if (!value) return;
        const field = findField(fieldNameCandidates);
        if (!field || typeof field.select !== "function") {
          console.warn("[PDF] Dropdown no trobat per:", fieldNameCandidates);
          return;
        }
        field.select(value);
      } catch (e) {
        console.warn("[PDF] Error select:", fieldNameCandidates, e?.message);
      }
    };

    const safeCheckSmart = (fieldNameCandidates, checked) => {
      try {
        if (!checked) return;
        const field = findField(fieldNameCandidates);
        if (!field || typeof field.check !== "function") {
          console.warn("[PDF] CheckBox no trobat per:", fieldNameCandidates);
          return;
        }
        field.check();
      } catch (e) {
        console.warn("[PDF] Error check:", fieldNameCandidates, e?.message);
      }
    };

    // =====================================================
    // DADES PERSONALS
    // =====================================================
    safeSetTextSmart("Nom participant", getVal("nom"));
    safeSetTextSmart("Cognoms participant", getVal("cognoms"));
    safeSetTextSmart(
      ["Nom sentitat participant", "Nom sentit participant"],
      getVal("nomSentit")
    );
    safeSetTextSmart("Document d'identitat", getVal("dni"));

    const rawDate = getVal("dataNaixement");
    let formattedDate = "";

    if (rawDate && rawDate.includes("-")) {
      const [y, m, d] = rawDate.split("-");
      formattedDate = `${d}-${m}-${y}`;
    }

    safeSetTextSmart(
      ["Data de naixament", "Data de naixement"],
      formattedDate
    );

    safeSetTextSmart("País d'origen", getVal("paisOrigen"));
    safeSetTextSmart("NASS", getVal("nass"));
    safeSetTextSmart("Adreça participant", getVal("adrecaParticipant"));
    safeSetTextSmart("Comarca participant", getVal("comarcaParticipant"));
    safeSetTextSmart("Població participant", getVal("poblacioParticipant"));
    safeSetTextSmart(
      ["Codi postal particiapnt", "Codi postal participant"],
      getVal("cpParticipant")
    );
    safeSetTextSmart(
      "Correu electrònic participant",
      getVal("email")
    );
    safeSetTextSmart("Telèfon", getVal("telefon"));
    safeSelectSmart("Gènere", getVal("genere"));

    // =====================================================
    // DADES PROFESSIONALS
    // =====================================================
    safeSelectSmart(
      [
        "Interès a participar a l'acció formativa",
        "Interès a participar en aquest procés d’orientació",
      ],
      getVal("interes")
    );

    safeSelectSmart("Estudis", getVal("estudis"));
    safeSelectSmart(
      [
        "Categoria professional (només persones ocuapdes)",
        "Categoria professional",
      ],
      getVal("categoriaProfessional")
    );

    // =====================================================
    // SITUACIÓ LABORAL
    // =====================================================
    const ocupat = isChecked("ocupat");

    safeCheckSmart(
      ["Ocupatada Consigneuhi codi3", "Ocupat/ada"],
      ocupat
    );

    if (ocupat && getVal("codi3")) {
      safeSelectSmart(
        ["Consigna", "codi3", "Règim", "Regim"],
        getVal("codi3")
      );
    }

    safeCheckSmart(
      ["Afectatada ERTO", "Afectada ERTO"],
      isChecked("erto")
    );

    safeCheckSmart(
      ["Cuidadora no professionalCPN", "Cuidadora no professional (CPN)"],
      isChecked("cpn")
    );

    // =====================================================
    // SITUACIONS ESPECÍFIQUES
    // =====================================================
    safeCheckSmart(
      ["Diversitat funcional", "Diversitat funcional i/o trastorn mental"],
      isChecked("diversitat")
    );

    safeCheckSmart(
      ["Violència de gènere", "Violencia de genere"],
      isChecked("violencia")
    );

    safeCheckSmart(
      ["Víctima de terrorisme", "Victima de terrorisme"],
      isChecked("terrorisme")
    );

    // =====================================================
    // COM VAS CONÈIXER
    // =====================================================
    const coneixerMap = [
      { k: "OT", pdf: ["Oficina de Treball", "OT"] },
      { k: "WebConsorci", pdf: ["Web del Consorci", "Consorci"] },
      { k: "EntitatFormacio", pdf: ["Entitat de formació", "Entitat de formacio"] },
      { k: "Agents", pdf: ["Agents econòmics i socials", "Agents economics i socials"] },
      { k: "Projectat", pdf: ["Projecta’t", "Projectat orientació professional", "Projecta"] },
      { k: "SOC", pdf: ["Cercador de cursos del SOC", "SOC"] },
      { k: "WebFPG", pdf: ["Web: fp.gencat.cat", "fp.gencat.cat", "Web fpgencat"] },
      { k: "LinkedIn", pdf: ["LinkedIn"] },
      { k: "EmpresaDifusio", pdf: ["Empresa"] },
      { k: "TwitterConsorci", pdf: ["Twitter (X) del Consorci", "Twitter Consorci", "@fpo_continua"] },
      { k: "TwitterOcupacio", pdf: ["Twitter (X) d'Ocupació", "Twitter Ocupacio", "@ocupaciocat"] },
      { k: "Amics", pdf: ["Amics", "Amics o familiars"] },
      { k: "Premsa", pdf: ["Premsa", "ràdio o televisió", "mitjans comunicació", "mitjans comunicacio"] },
      { k: "AltresDifusio", pdf: ["Altres"] },
    ];

    for (const item of coneixerMap) {
      safeCheckSmart(item.pdf, isChecked(item.k));
    }

    // =====================================================
    // EMPRESA
    // =====================================================
    safeSetTextSmart(["Rao social", "Raó social"], getVal("raoSocial"));
    safeSetTextSmart(["CIF_empresa", "CIF empresa", "CIF"], getVal("cif"));
    safeSetTextSmart(
      ["Núm. d’inscripció a la Seguretat Social", "Num. d'inscripcio a la Seguretat Social"],
      getVal("nassEmpresa")
    );
    safeSetTextSmart("Adreça del centre de treball", getVal("adrecaEmpresa"));
    safeSetTextSmart("Comarca empresa", getVal("comarcaEmpresa"));
    safeSetTextSmart("Població empresa", getVal("poblacioEmpresa"));
    safeSetTextSmart("Codi postal empresa", getVal("cpEmpresa"));
    safeSelectSmart(["Mida de l'empresa", "Mida de l’empresa"], getVal("midaEmpresa"));

    // =====================================================
    // DECLARACIONS
    // =====================================================
    safeCheckSmart(
      ["Declaro que he estat informat", "Declaro"],
      isChecked("declaro")
    );

    safeCheckSmart(
      ["utilitzar les meves dades personals", "dades personals", "rebre informació"],
      isChecked("autoritzacioDades")
    );

    safeCheckSmart(
      ["la meva imatge/veu", "imatge/veu", "fotografies i/o vídeos", "videos"],
      isChecked("autoritzacioImatge")
    );

    // =====================================================
    // SIGNATURA
    // =====================================================
    const page = pdfDoc.getPages()[0];

    const sigB64 = (getVal("signature") || "").replace(
      /^data:image\/png;base64,/,
      ""
    );

    if (sigB64) {
      const pngImage = await pdfDoc.embedPng(sigB64);
      page.drawImage(pngImage, {
        x: 240,
        y: 160,
        width: 220,
        height: 70,
      });
    }

    const todaySignature = new Date();
    const formattedSignatureDate = `${String(todaySignature.getDate()).padStart(2, "0")}-${String(
      todaySignature.getMonth() + 1
    ).padStart(2, "0")}-${todaySignature.getFullYear()}`;

    page.drawText(`Barcelona, ${formattedSignatureDate}`, {
      x: 200,
      y: 175,
      size: 11,
    });

    pdfForm.updateFieldAppearances();
    const pdfBytes = await pdfDoc.save();


    // =====================================================
// ➕ ACORDS (FIX)
// =====================================================
const acordsDoc = await PDFDocument.load(
  fs.readFileSync(path.join(process.cwd(), "public/Acords.pdf"))
);

const acordsForm = acordsDoc.getForm();
const acordsFields = acordsForm.getFields();
const acordsPage = acordsDoc.getPages()[0];

// 🔧 MATCH MILLORAT (exacte → conté)
const findAcordField = (candidates) => {
  const list = Array.isArray(candidates) ? candidates : [candidates];
  const normCandidates = list.map(norm).filter(Boolean);

  // 1. EXACTE
  for (const cand of normCandidates) {
    const f = acordsFields.find(x => norm(x.getName()) === cand);
    if (f) return f;
  }

  // 2. CONTÉ (fallback)
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

// ✅ NOM PERSONA ORIENTADA (FIX CLAR)
setAcord(
  [
    "Nom i cognom persona orientada",
    "Nom i cognoms persona orientada",
    "persona orientada"
  ],
  `${getVal("nom")} ${getVal("cognoms")}`
);

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
// ➕ INFORME (FIX)
// =====================================================
const informeDoc = await PDFDocument.load(
  fs.readFileSync(path.join(process.cwd(), "public/Informe.pdf"))
);

const informeForm = informeDoc.getForm();
const informeFields = informeForm.getFields();

// 🔧 TROBAR TOTS (per duplicats)
const findAllInformeFields = (candidates) => {
  const list = Array.isArray(candidates) ? candidates : [candidates];
  const normCandidates = list.map(norm).filter(Boolean);

  let results = [];

  for (const cand of normCandidates) {
    const found = informeFields.filter(x =>
      norm(x.getName()).includes(cand)
    );
    results.push(...found);
  }

  return results;
};

// 🔧 SET NORMAL (primer match)
const setInforme = (names, val) => {
  const fields = findAllInformeFields(names);
  const f = fields[0];
  if (f?.setText) f.setText(val ?? "");
};

// 🔧 SET PER INDEX (quan hi ha duplicats)
const setInformeIndex = (names, index, val) => {
  const fields = findAllInformeFields(names);
  if (fields[index]?.setText) {
    fields[index].setText(val ?? "");
  }
};

// ✅ NOM PERSONA ORIENTADA (FIX)
setInforme(
  [
    "Nom i cognoms",
    "Nom i cognoms persona orientada"
  ],
  `${getVal("nom")} ${getVal("cognoms")}`
);

// ✅ NIF
setInforme(["nif"], getVal("dni"));

// ❗ TELÈFON → IMPORTANT (2 camps iguals)
// 0 = entitat
// 1 = persona orientada
setInforme(["telefon_persona"], getVal("telefon"));

// ✅ EMAIL (normalment no duplicat)
setInforme(["correu"], getVal("email"));

const informePdfBytes = await informeDoc.save();


// =====================================================
// 📎 ADJUNTS (AMB NOMS PERSONALITZATS)
// =====================================================

const nomComplet = `${getVal("nom")} ${getVal("cognoms")}`.trim();
const dni = getVal("dni");

const attachments = [
  {
    filename: `Annex ${nomComplet}.pdf`,
    content: pdfBytes,
  },
  {
    filename: `Acords ${nomComplet}.pdf`,
    content: acordsPdfBytes,
  },
  {
    filename: `Informe_personaorientada_${dni}.pdf`,
    content: informePdfBytes,
  }
];

const detectFileType = (fieldName, originalName) => {
  const name = `${fieldName} ${originalName}`.toLowerCase();

  if (name.includes("dni")) return `DNI ${nomComplet}`;
  if (name.includes("vida")) return `Vida Laboral ${nomComplet}`;
  if (name.includes("cv")) return `CV ${nomComplet}`;

  return `${nomComplet}`;
};

const filesObj = files || {};

for (const [fieldName, fileField] of Object.entries(filesObj)) {
  const list = Array.isArray(fileField) ? fileField : [fileField];

  for (const file of list) {
    if (!file?.filepath) continue;
    if (typeof file.size === "number" && file.size <= 0) continue;

    const fileBuffer = fs.readFileSync(file.filepath);
    const baseName = detectFileType(fieldName, file.originalFilename || "");
    const ext = path.extname(file.originalFilename || "") || ".pdf";

    attachments.push({
      filename: `${baseName}${ext}`,
      content: fileBuffer,
      contentType: file.mimetype || "application/octet-stream"
    });
  }
}

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

// 👇 AIXÒ ÉS CLAU (no ho perdis)
return res.status(200).json({ ok: true });

} catch (err) {
  console.error("ERROR REAL:", err);
  return res.status(500).json({ error: err.message || "Server error" });
}
}
