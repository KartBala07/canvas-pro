// Syllabus text → structured weights + late-work policy.
// Rule-based (fast, no AI required). An AI tab can write the same shape.

const WEIGHT_KEY = /(homework|classwork|assignment|problem set|worksheet|participation|quiz|test|exam|midterm|final|project|essay|paper|lab|portfolio)/i;

const TYPE_GROUPS = [
  { keys: /(final|midterm|exam|test)/i, type: "exam" },
  { keys: /quiz(zes)?/i, type: "quiz" },
  { keys: /(project|essay|paper|lab|portfolio)/i, type: "project" },
  { keys: /(participation)/i, type: "participation" },
  { keys: /(homework|assign|classwork|worksheet|problem set)/i, type: "assignment" },
];

function classify(typeName) {
  const n = typeName || "";
  for (const g of TYPE_GROUPS) if (g.keys.test(n)) return g.type;
  return "assignment";
}

function extractWeights(text) {
  const weights = {};
  const segs = String(text || "").split(/[;,]|\r?\n|\.\s+(?=[A-Z])/);
  for (const segRaw of segs) {
    const seg = segRaw.trim();
    if (!seg) continue;
    let m = /(\d+(?:\.\d+)?)\s*%\s+([a-zA-Z][a-zA-Z ]{2,30}?)\s*$/.exec(seg);   // "20% Homework"
    let pct = m ? parseFloat(m[1]) : null;
    let label = m ? m[2] : null;
    if (!m) {
      m = /([a-zA-Z][a-zA-Z ]{2,30}?)\s*[:=]\s*(\d+(?:\.\d+)?)\s*%/.exec(seg);  // "Homework: 20%"
      if (m) { label = m[1]; pct = parseFloat(m[2]); }
    }
    if (!m && /\d+(?:\.\d+)?\s*%$/.test(seg)) {
      m = /([a-zA-Z][a-zA-Z ]{2,30}?)\s+(\d+(?:\.\d+)?)\s*%$/.exec(seg);         // "Homework 20%"
      if (m) { label = m[1]; pct = parseFloat(m[2]); }
    }
    if (!m || pct == null) continue;
    if (pct <= 0 || pct > 100) continue;
    const type = classify(label);
    if (!weights[type] || pct > weights[type]) weights[type] = pct;
  }
  return weights;
}

function extractLate(text) {
  const policy = { note: [] };
  const seps = /[;.]|\r?\n/;
  const segs = String(text || "").split(seps).filter(Boolean);
  for (const segRaw of segs) {
    const line = segRaw.trim();
    if (!line) continue;
    if (!/late|deduct|penalty|credit|accepted|after due|deadline|forgiven|grace/i.test(line)) continue;
    if (/no\s*late|late\s*work\s*(?:will\s*)?not\s*be?\s*accept(?:ed)?|\bnot\s*(?:be\s*)?accept(?:ed)?|does\s+not\s+accept/i.test(line)) policy.noLate = true;
    const perDay = /(\d{1,3})\s*%\s*[^.\n]{0,40}?per\s*(?:school\s*|class\s*)?day/i.exec(line);
    if (perDay) policy.perDay = parseFloat(perDay[1]);
    if (!perDay) {
      const flat = /(?:late\s*penalty|penalty)\s*(?:is|of|:)?\s*(\d{1,3})\s*%/.exec(line);
      if (flat) policy.flat = parseFloat(flat[1]);
    }
    const fullDays = /(?:full|all|no)\s*credit[^.\n]{0,30}?(\d{1,2})\s*(?:school\s*)?days?/i.exec(line);
    if (fullDays) policy.fullDays = parseInt(fullDays[1], 10);
    const cap = /(?:cap(?:ped)?|maximum|max|up\s*to)\s*(?:at\s*)?\s*(\d{1,3})\s*%/.exec(line);
    if (cap) policy.capMin = parseFloat(cap[1]);
    policy.note.push(line);
  }
  policy.note = [...new Set(policy.note)].slice(0, 4);
  return policy;
}

export function parseSyllabus(text) {
  return {
    weights: extractWeights(text),
    latePolicy: extractLate(text),
    raw: String(text || "").slice(0, 12000),
  };
}

// Credit factor (0..1) a late submission earns, from a parsed policy.
export function lateCredit(p, daysLate) {
  if (!p) return { credit: 1, note: "No policy — assumed full credit" };
  if (p.noLate) return { credit: 0, note: "Syllabus: no late work accepted" };
  if (p.fullDays != null && daysLate <= p.fullDays) {
    return { credit: 1, note: `Full credit (within ${p.fullDays} day${p.fullDays === 1 ? "" : "s"})` };
  }
  let c = 1;
  let note = "";
  if (p.perDay) {
    c = 1 - daysLate * p.perDay / 100;
    note = `−${p.perDay}%/day, ${daysLate} day${daysLate === 1 ? "" : "s"} late`;
  } else if (p.flat != null) {
    c = 1 - p.flat / 100;
    note = `Flat −${p.flat}% penalty`;
  } else {
    note = "No numeric penalty found — assumed full credit";
  }
  if (p.capMin != null) {
    c = Math.max(c, p.capMin / 100);
    note += ` (floor ${p.capMin}%)`;
  }
  c = Math.max(0, Math.min(1, c));
  return { credit: c, note };
}