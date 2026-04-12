// Keyboard adjacency map for QWERTY layout
const KEYBOARD_ADJACENT = {
  a: "qwsz", b: "vghn", c: "xdfv", d: "erfcxs", e: "rdsw",
  f: "rtgvcd", g: "tyhbvf", h: "yujnbg", i: "uojk", j: "uiknmh",
  k: "iolmj", l: "opk", m: "njk", n: "bhjm", o: "iplk",
  p: "ol", q: "wa", r: "etfd", s: "wedxza", t: "rygf",
  u: "yihj", v: "cfgb", w: "qase", x: "zsdc", y: "tugh", z: "asx",
};

// Common homoglyph substitutions (including internationalized chars)
const HOMOGLYPHS = {
  a: ["4", "@", "à", "á", "â", "ã", "ä"],
  b: ["d", "6"],
  c: ["k", "ç"],
  d: ["b", "cl"],
  e: ["3", "è", "é", "ê", "ë"],
  g: ["9", "q"],
  h: ["lh"],
  i: ["1", "l", "!", "ì", "í", "î", "ï"],
  k: ["lk"],
  l: ["1", "i", "|"],
  m: ["rn", "nn"],
  n: ["m", "ñ"],
  o: ["0", "ò", "ó", "ô", "õ", "ö"],
  p: ["q"],
  q: ["p", "g"],
  r: ["v"],
  s: ["5", "$", "ş"],
  t: ["7"],
  u: ["v", "ù", "ú", "û", "ü"],
  v: ["u"],
  w: ["vv", "uu"],
  y: ["ÿ"],
  z: ["2"],
};

const COMMON_TLDS = [
  "com", "net", "org", "io", "co", "info", "biz", "xyz",
  "dev", "app", "site", "online", "tech", "store", "cloud",
];

const DOMAIN_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.[a-zA-Z]{2,}$/;
const MAX_NAME_LENGTH = 40;

export function validateDomain(domain) {
  if (!domain || typeof domain !== "string") {
    return { valid: false, error: "Domain is required" };
  }
  const d = domain.trim().toLowerCase();
  if (!d.includes(".")) {
    return { valid: false, error: "Domain must include a TLD (e.g. example.com)" };
  }
  if (d.length > 253) {
    return { valid: false, error: "Domain exceeds maximum length (253 chars)" };
  }
  const name = d.split(".")[0];
  if (name.length > MAX_NAME_LENGTH) {
    return { valid: false, error: `Domain name too long (max ${MAX_NAME_LENGTH} chars) to generate typos efficiently` };
  }
  if (!DOMAIN_REGEX.test(d)) {
    return { valid: false, error: "Invalid domain format. Use alphanumeric characters and hyphens only." };
  }
  return { valid: true, domain: d };
}

export function generateTypoDomains(domain) {
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

  // 1. Character omission
  for (let i = 0; i < name.length; i++) {
    const v = name.slice(0, i) + name.slice(i + 1);
    if (v.length > 0) add(v + "." + tld, "Omission");
  }

  // 2. Adjacent character swap (transposition)
  for (let i = 0; i < name.length - 1; i++) {
    const chars = name.split("");
    [chars[i], chars[i + 1]] = [chars[i + 1], chars[i]];
    add(chars.join("") + "." + tld, "Transposition");
  }

  // 3. Adjacent key replacement
  for (let i = 0; i < name.length; i++) {
    const adjacents = KEYBOARD_ADJACENT[name[i].toLowerCase()];
    if (adjacents) {
      for (const adj of adjacents) {
        add(name.slice(0, i) + adj + name.slice(i + 1) + "." + tld, "Adjacent Key");
      }
    }
  }

  // 4. Character duplication
  for (let i = 0; i < name.length; i++) {
    add(name.slice(0, i) + name[i] + name[i] + name.slice(i + 1) + "." + tld, "Duplication");
  }

  // 5. Character insertion
  for (let i = 0; i <= name.length; i++) {
    for (let c = 97; c <= 122; c++) {
      add(name.slice(0, i) + String.fromCharCode(c) + name.slice(i) + "." + tld, "Insertion");
    }
  }

  // 6. Homoglyph substitution
  for (let i = 0; i < name.length; i++) {
    const glyphs = HOMOGLYPHS[name[i].toLowerCase()];
    if (glyphs) {
      for (const g of glyphs) {
        add(name.slice(0, i) + g + name.slice(i + 1) + "." + tld, "Homoglyph");
      }
    }
  }

  // 7. TLD swap
  for (const altTld of COMMON_TLDS) {
    if (altTld !== tld.toLowerCase()) add(name + "." + altTld, "TLD Swap");
  }

  // 8. Dot insertion
  for (let i = 1; i < name.length; i++) {
    add(name.slice(0, i) + "." + name.slice(i) + "." + tld, "Dot Insertion");
  }

  // 9. Hyphen insertion
  for (let i = 1; i < name.length; i++) {
    add(name.slice(0, i) + "-" + name.slice(i) + "." + tld, "Hyphen Insertion");
  }

  // 10. Vowel swap
  const vowels = "aeiou";
  for (let i = 0; i < name.length; i++) {
    if (vowels.includes(name[i].toLowerCase())) {
      for (const v of vowels) {
        if (v !== name[i].toLowerCase()) {
          add(name.slice(0, i) + v + name.slice(i + 1) + "." + tld, "Vowel Swap");
        }
      }
    }
  }

  return Array.from(results.values());
}
