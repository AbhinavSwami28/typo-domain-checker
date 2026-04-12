// Keyboard adjacency map for QWERTY layout
const KEYBOARD_ADJACENT = {
  a: "qwsz",
  b: "vghn",
  c: "xdfv",
  d: "erfcxs",
  e: "rdsw",
  f: "rtgvcd",
  g: "tyhbvf",
  h: "yujnbg",
  i: "uojk",
  j: "uiknmh",
  k: "iolmj",
  l: "opk",
  m: "njk",
  n: "bhjm",
  o: "iplk",
  p: "ol",
  q: "wa",
  r: "etfd",
  s: "wedxza",
  t: "rygf",
  u: "yihj",
  v: "cfgb",
  w: "qase",
  x: "zsdc",
  y: "tugh",
  z: "asx",
};

// Common homoglyph substitutions
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

// Common TLD alternatives
const COMMON_TLDS = [
  "com",
  "net",
  "org",
  "io",
  "co",
  "info",
  "biz",
  "xyz",
  "dev",
  "app",
  "site",
  "online",
];

/**
 * Generate all typo/lookalike permutations for a given domain.
 */
export function generateTypoDomains(domain) {
  const dotIndex = domain.indexOf(".");
  if (dotIndex === -1) return [];

  const name = domain.substring(0, dotIndex);
  const tld = domain.substring(dotIndex + 1);
  const results = new Map(); // domain -> { domain, type }

  function add(variant, type) {
    // Skip if same as original or empty name part
    const d = variant.toLowerCase();
    if (d === domain.toLowerCase()) return;
    const namePart = d.substring(0, d.indexOf("."));
    if (!namePart || namePart.length < 1) return;
    if (!results.has(d)) {
      results.set(d, { domain: d, type });
    }
  }

  // 1. Character omission - skip one character at a time
  for (let i = 0; i < name.length; i++) {
    const variant = name.slice(0, i) + name.slice(i + 1);
    if (variant.length > 0) {
      add(variant + "." + tld, "Character Omission");
    }
  }

  // 2. Adjacent character swap (transposition)
  for (let i = 0; i < name.length - 1; i++) {
    const chars = name.split("");
    [chars[i], chars[i + 1]] = [chars[i + 1], chars[i]];
    add(chars.join("") + "." + tld, "Transposition");
  }

  // 3. Adjacent key replacement (fat-finger typos)
  for (let i = 0; i < name.length; i++) {
    const char = name[i].toLowerCase();
    const adjacents = KEYBOARD_ADJACENT[char];
    if (adjacents) {
      for (const adj of adjacents) {
        const variant = name.slice(0, i) + adj + name.slice(i + 1);
        add(variant + "." + tld, "Adjacent Key");
      }
    }
  }

  // 4. Character duplication
  for (let i = 0; i < name.length; i++) {
    const variant = name.slice(0, i) + name[i] + name[i] + name.slice(i + 1);
    add(variant + "." + tld, "Character Duplication");
  }

  // 5. Character insertion (insert each letter a-z at each position)
  for (let i = 0; i <= name.length; i++) {
    for (let c = 97; c <= 122; c++) {
      const char = String.fromCharCode(c);
      const variant = name.slice(0, i) + char + name.slice(i);
      add(variant + "." + tld, "Character Insertion");
    }
  }

  // 6. Homoglyph substitution
  for (let i = 0; i < name.length; i++) {
    const char = name[i].toLowerCase();
    const glyphs = HOMOGLYPHS[char];
    if (glyphs) {
      for (const glyph of glyphs) {
        const variant = name.slice(0, i) + glyph + name.slice(i + 1);
        add(variant + "." + tld, "Homoglyph");
      }
    }
  }

  // 7. TLD swap
  for (const altTld of COMMON_TLDS) {
    if (altTld !== tld.toLowerCase()) {
      add(name + "." + altTld, "TLD Swap");
    }
  }

  // 8. Dot insertion (subdomain-like)
  for (let i = 1; i < name.length; i++) {
    const variant = name.slice(0, i) + "." + name.slice(i);
    add(variant + "." + tld, "Dot Insertion");
  }

  // 9. Hyphen insertion
  for (let i = 1; i < name.length; i++) {
    const variant = name.slice(0, i) + "-" + name.slice(i);
    add(variant + "." + tld, "Hyphen Insertion");
  }

  // 10. Vowel swap
  const vowels = "aeiou";
  for (let i = 0; i < name.length; i++) {
    if (vowels.includes(name[i].toLowerCase())) {
      for (const v of vowels) {
        if (v !== name[i].toLowerCase()) {
          const variant = name.slice(0, i) + v + name.slice(i + 1);
          add(variant + "." + tld, "Vowel Swap");
        }
      }
    }
  }

  return Array.from(results.values());
}
