// Keyboard adjacency map for QWERTY layout
const KEYBOARD_ADJACENT = {
  a: "qwsz", b: "vghn", c: "xdfv", d: "erfcxs", e: "rdsw",
  f: "rtgvcd", g: "tyhbvf", h: "yujnbg", i: "uojk", j: "uiknmh",
  k: "iolmj", l: "opk", m: "njk", n: "bhjm", o: "iplk",
  p: "ol", q: "wa", r: "etfd", s: "wedxza", t: "rygf",
  u: "yihj", v: "cfgb", w: "qase", x: "zsdc", y: "tugh", z: "asx",
};

const HOMOGLYPHS = {
  a: ["4", "@"], b: ["d", "6"], c: ["k"], d: ["b", "cl"],
  e: ["3"], g: ["9", "q"], i: ["1", "l", "!"], k: ["lk"],
  l: ["1", "i", "|"], m: ["rn", "nn"], n: ["m"], o: ["0"],
  p: ["q"], q: ["p", "g"], r: ["v"], s: ["5", "$"],
  t: ["7"], u: ["v"], v: ["u"], w: ["vv", "uu"], z: ["2"],
};

const COMMON_TLDS = ["com", "net", "org", "io", "co", "info", "biz", "xyz", "dev", "app", "site", "online"];

function generateTypoDomains(domain) {
  const dotIndex = domain.indexOf(".");
  if (dotIndex === -1) return [];

  const name = domain.substring(0, dotIndex);
  const tld = domain.substring(dotIndex + 1);
  const results = new Map();

  function add(variant, type) {
    const d = variant.toLowerCase();
    if (d === domain.toLowerCase()) return;
    const namePart = d.substring(0, d.indexOf("."));
    if (!namePart || namePart.length < 1) return;
    if (!results.has(d)) {
      results.set(d, { domain: d, type });
    }
  }

  for (let i = 0; i < name.length; i++) {
    const v = name.slice(0, i) + name.slice(i + 1);
    if (v.length > 0) add(v + "." + tld, "Character Omission");
  }

  for (let i = 0; i < name.length - 1; i++) {
    const chars = name.split("");
    [chars[i], chars[i + 1]] = [chars[i + 1], chars[i]];
    add(chars.join("") + "." + tld, "Transposition");
  }

  for (let i = 0; i < name.length; i++) {
    const adjacents = KEYBOARD_ADJACENT[name[i].toLowerCase()];
    if (adjacents) {
      for (const adj of adjacents) {
        add(name.slice(0, i) + adj + name.slice(i + 1) + "." + tld, "Adjacent Key");
      }
    }
  }

  for (let i = 0; i < name.length; i++) {
    add(name.slice(0, i) + name[i] + name[i] + name.slice(i + 1) + "." + tld, "Character Duplication");
  }

  for (let i = 0; i <= name.length; i++) {
    for (let c = 97; c <= 122; c++) {
      add(name.slice(0, i) + String.fromCharCode(c) + name.slice(i) + "." + tld, "Character Insertion");
    }
  }

  for (let i = 0; i < name.length; i++) {
    const glyphs = HOMOGLYPHS[name[i].toLowerCase()];
    if (glyphs) {
      for (const g of glyphs) {
        add(name.slice(0, i) + g + name.slice(i + 1) + "." + tld, "Homoglyph");
      }
    }
  }

  for (const altTld of COMMON_TLDS) {
    if (altTld !== tld.toLowerCase()) add(name + "." + altTld, "TLD Swap");
  }

  for (let i = 1; i < name.length; i++) {
    add(name.slice(0, i) + "." + name.slice(i) + "." + tld, "Dot Insertion");
    add(name.slice(0, i) + "-" + name.slice(i) + "." + tld, "Hyphen Insertion");
  }

  const vowels = "aeiou";
  for (let i = 0; i < name.length; i++) {
    if (vowels.includes(name[i].toLowerCase())) {
      for (const v of vowels) {
        if (v !== name[i].toLowerCase()) add(name.slice(0, i) + v + name.slice(i + 1) + "." + tld, "Vowel Swap");
      }
    }
  }

  return Array.from(results.values());
}

export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { domain } = req.body;

  if (!domain || !domain.includes(".")) {
    return res.status(400).json({ error: "Please provide a valid domain (e.g. example.com)" });
  }

  const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}$/;
  if (!domainRegex.test(domain)) {
    return res.status(400).json({ error: "Invalid domain format" });
  }

  const typos = generateTypoDomains(domain.toLowerCase().trim());
  res.json({ original: domain, count: typos.length, typos });
}
