// Lexicons for the offline heuristic engine. Kept deliberately small and transparent:
// every score the heuristic engine produces can be traced back to an entry here.

/** Loaded / emotive terms: [valence -1..1, intensity 0..1]. Matched on word stems. */
export const EMOTIVE: Record<string, [number, number]> = {
  // strongly negative
  catastroph: [-0.9, 0.95], disaster: [-0.85, 0.9], devastat: [-0.85, 0.9], horrif: [-0.9, 0.9],
  atroci: [-0.95, 0.95], outrage: [-0.8, 0.85], outrageous: [-0.8, 0.85], scandal: [-0.75, 0.8],
  shocking: [-0.6, 0.8], appalling: [-0.85, 0.85], disgrace: [-0.85, 0.85], shameful: [-0.85, 0.8],
  crisis: [-0.7, 0.8], chaos: [-0.75, 0.8], chaotic: [-0.7, 0.75], collapse: [-0.7, 0.8],
  plummet: [-0.6, 0.75], crash: [-0.65, 0.75], slash: [-0.5, 0.65], slam: [-0.55, 0.7],
  blast: [-0.5, 0.65], destroy: [-0.8, 0.85], ruin: [-0.75, 0.8], betray: [-0.8, 0.85],
  corrupt: [-0.8, 0.8], fraud: [-0.8, 0.8], lie: [-0.7, 0.7], lying: [-0.75, 0.75], liar: [-0.85, 0.85],
  threat: [-0.6, 0.7], terror: [-0.9, 0.9], fear: [-0.6, 0.7], panic: [-0.7, 0.8], alarming: [-0.6, 0.7],
  dangerous: [-0.65, 0.7], reckless: [-0.7, 0.75], incompetent: [-0.75, 0.75], failure: [-0.6, 0.6],
  failed: [-0.5, 0.5], disastrous: [-0.85, 0.9], toxic: [-0.7, 0.75], radical: [-0.45, 0.65],
  extremist: [-0.75, 0.85], dire: [-0.65, 0.7], grim: [-0.55, 0.6], bleak: [-0.55, 0.6],
  brutal: [-0.75, 0.8], cruel: [-0.8, 0.8], vicious: [-0.8, 0.85], attack: [-0.55, 0.65],
  war: [-0.6, 0.7], victim: [-0.6, 0.65], suffer: [-0.6, 0.65], tragic: [-0.75, 0.8], tragedy: [-0.75, 0.8],
  hoax: [-0.75, 0.8], sham: [-0.7, 0.75], rigged: [-0.75, 0.8],
  "cover-up": [-0.75, 0.8], worst: [-0.7, 0.7], terrible: [-0.75, 0.75], awful: [-0.75, 0.75],
  horrible: [-0.8, 0.8], nightmare: [-0.8, 0.85], doom: [-0.8, 0.85], exploit: [-0.6, 0.65],
  // mildly negative / skeptical
  controvers: [-0.35, 0.5], dubious: [-0.45, 0.5], questionable: [-0.4, 0.45], troubling: [-0.45, 0.5],
  concern: [-0.3, 0.35], worr: [-0.4, 0.45], risk: [-0.3, 0.35], decline: [-0.35, 0.4], struggl: [-0.4, 0.45],
  // positive
  breakthrough: [0.75, 0.8], historic: [0.5, 0.65], landmark: [0.55, 0.6], triumph: [0.8, 0.85],
  soar: [0.6, 0.7], surge: [0.4, 0.6], boom: [0.55, 0.65], thriv: [0.6, 0.6], brilliant: [0.8, 0.8],
  remarkable: [0.6, 0.65], incredible: [0.65, 0.75], amazing: [0.7, 0.75], hero: [0.75, 0.8],
  heroic: [0.8, 0.85], champion: [0.6, 0.65], victory: [0.7, 0.75], success: [0.55, 0.55],
  revolutionary: [0.6, 0.75], "game-changer": [0.65, 0.75], unprecedented: [0.1, 0.7], miracle: [0.8, 0.85],
  best: [0.6, 0.6], excellent: [0.7, 0.65], hope: [0.5, 0.5], celebrat: [0.65, 0.65], praise: [0.55, 0.55],
  robust: [0.35, 0.4], strong: [0.3, 0.3], booming: [0.6, 0.7], stunning: [0.5, 0.75], promising: [0.45, 0.45],
};

/** Markers of subjective / evaluative language (opinion signals). */
export const OPINION_MARKERS = [
  "should", "ought to", "must", "need to", "needs to", "it's time", "it is time", "i think", "i believe",
  "we believe", "i feel", "in my view", "in my opinion", "arguably", "clearly", "obviously", "undoubtedly",
  "of course", "frankly", "honestly", "deserve", "deserves", "shame", "absurd", "ridiculous", "foolish",
  "wise", "unacceptable", "we can't", "we cannot", "let's", "let us", "it seems", "seems to me", "best",
  "worst", "better", "worse", "beautiful", "ugly", "stupid", "smart", "great", "terrible",
];

/** Hedging lowers certainty; absolutes raise falsifiability risk. */
export const HEDGES = ["may", "might", "could", "reportedly", "allegedly", "possibly", "perhaps", "apparently", "suggests", "likely", "unclear", "estimated", "roughly", "about", "around", "nearly", "almost"];
export const ABSOLUTES = ["always", "never", "all", "every", "none", "nobody", "everyone", "entirely", "completely", "totally", "guaranteed", "proven", "undeniable", "impossible"];
export const CAUSAL = ["because", "caused", "causes", "led to", "leads to", "resulted in", "results in", "due to", "drove", "driven by", "thanks to", "triggered", "responsible for"];

/** Attribution patterns. Capture group 1 = source name. */
export const ATTRIBUTION_PATTERNS: RegExp[] = [
  /according to (?:the |a |an )?((?:[A-Z][\w.&'-]*\s?){1,6})/,
  /((?:[A-Z][\w.&'-]*\s?){1,5}) (?:said|says|told|reported|reports|stated|states|found|finds|estimated|estimates|announced|confirmed|wrote|argued|argues|warned|warns|noted|notes)\b/,
  /(?:said|says|told|reported|stated|warned|noted|argued) ((?:[A-Z][\w.&'-]*\s?){1,5})/,
  /(?:published (?:in|by)|data from|figures from|a study by|a report by|research from|survey by|poll by) (?:the |a )?((?:[A-Z][\w.&'-]*\s?){1,6})/,
];

export const SOURCE_NOUNS = /\b(study|report|survey|poll|data|census|analysis|audit|filing|records|statistics|paper|journal|review|figures|index)\b/i;
export const QUANT = /(\d[\d,.]*\s?(%|percent|per cent|million|billion|trillion|thousand|bn|m\b|k\b)?|\$\s?\d|€\s?\d|£\s?\d)/i;
export const FACTUAL_VERBS = /\b(is|are|was|were|has|have|had|rose|fell|increased|decreased|declined|grew|dropped|reached|totaled|totalled|recorded|reported|found|showed|shows|announced|approved|passed|signed|launched|killed|injured|elected|won|lost|cost|costs|employs|produced|holds|contains)\b/i;

/** Framing taxonomy (after Semetko & Valkenburg, extended). */
export const FRAMES: { id: string; label: string; description: string; terms: string[] }[] = [
  {
    id: "economic", label: "Economic", description: "Costs, markets, jobs and financial consequences.",
    terms: ["economy", "economic", "cost", "costs", "price", "prices", "market", "markets", "jobs", "job", "unemployment", "inflation", "tax", "taxes", "budget", "spending", "revenue", "profit", "growth", "gdp", "investment", "investors", "wage", "wages", "debt", "billion", "million", "trade", "tariff", "business", "industry", "stock", "fund", "funding", "financial", "dollar"],
  },
  {
    id: "conflict", label: "Conflict", description: "Disagreement, opposition, winners and losers.",
    terms: ["clash", "fight", "battle", "opponents", "rivals", "critics", "dispute", "accused", "slammed", "attack", "attacked", "versus", "against", "oppose", "opposed", "opposition", "feud", "war", "standoff", "backlash", "confront", "rejected", "blame", "row", "divided", "split"],
  },
  {
    id: "human", label: "Human Interest", description: "Personal stories, emotions and individual faces.",
    terms: ["family", "families", "mother", "father", "child", "children", "kids", "daughter", "son", "story", "lives", "life", "home", "community", "neighbors", "residents", "personal", "tears", "heartbreaking", "struggle", "dream", "hope", "victims", "patients", "students", "workers", "people"],
  },
  {
    id: "morality", label: "Morality", description: "Right and wrong, values, religion and social norms.",
    terms: ["moral", "morally", "ethical", "ethics", "values", "right", "wrong", "justice", "unjust", "fair", "unfair", "faith", "god", "sin", "evil", "duty", "responsibility", "dignity", "freedom", "rights", "shameful", "integrity", "honest", "corrupt"],
  },
  {
    id: "responsibility", label: "Responsibility", description: "Who caused the problem and who should fix it.",
    terms: ["responsible", "blame", "fault", "accountable", "accountability", "government", "officials", "administration", "policy", "policies", "regulators", "agency", "failed", "failure", "negligence", "should", "must", "solution", "fix", "address", "reform", "oversight", "mandate", "law"],
  },
  {
    id: "security", label: "Security & Risk", description: "Threats, safety, crime and defense.",
    terms: ["security", "safety", "threat", "threats", "risk", "risks", "danger", "dangerous", "crime", "criminal", "police", "military", "defense", "attack", "terror", "terrorism", "border", "violence", "weapons", "cyber", "breach", "emergency", "warning", "protect"],
  },
  {
    id: "science", label: "Science & Health", description: "Research, evidence, medicine and public health.",
    terms: ["study", "research", "researchers", "scientists", "science", "scientific", "data", "evidence", "trial", "clinical", "health", "disease", "virus", "vaccine", "doctors", "hospital", "medical", "climate", "emissions", "temperature", "experiment", "peer", "university", "journal"],
  },
  {
    id: "power", label: "Political Power", description: "Elections, parties, leaders and political strategy.",
    terms: ["election", "elections", "vote", "voters", "campaign", "party", "parties", "president", "minister", "senator", "congress", "parliament", "lawmakers", "democrats", "republicans", "conservative", "liberal", "polls", "poll", "leader", "leadership", "political", "politics", "coalition", "bill"],
  },
];
