export interface Skill {
  key: string;
  name: string;
  group: string;
  desc: string;
  icon: string;
  href: string;
}

export const SKILL_GROUPS = [
  "ভিসা ইন্টেলিজেন্স",
  "ডকুমেন্ট",
  "অটোমেশন",
  "যোগাযোগ",
  "মার্কেটিং ও শিডিউল",
] as const;

export const SKILLS: Skill[] = [
  { key: "visa-interview", name: "এআই ভিসা ইন্টারভিউ", group: "ভিসা ইন্টেলিজেন্স", desc: "বাংলায় ধাপে ধাপে প্রশ্ন করে আবেদনকারীর পূর্ণ প্রোফাইল তৈরি।", icon: "🎙️", href: "/clients" },
  { key: "eligibility-check", name: "যোগ্যতা স্কোর", group: "ভিসা ইন্টেলিজেন্স", desc: "পাঁচটি ভিত্তিতে ০–১০০ স্কোর ও বিস্তারিত ব্রেকডাউন।", icon: "📊", href: "/applications" },
  { key: "risk-analysis", name: "ঝুঁকি ও রেড ফ্ল্যাগ", group: "ভিসা ইন্টেলিজেন্স", desc: "রিফিউজালের ঝুঁকি চিহ্নিত করে সমাধান দেয়।", icon: "🚩", href: "/applications" },
  { key: "success-probability", name: "সফলতার সম্ভাবনা", group: "ভিসা ইন্টেলিজেন্স", desc: "দেশভিত্তিক কঠিনতা মিলিয়ে অনুমোদনের সম্ভাবনা।", icon: "🎯", href: "/applications" },
  { key: "fee-calculator", name: "ফি ক্যালকুলেটর", group: "ভিসা ইন্টেলিজেন্স", desc: "সরকারি ফি, সার্ভিস ফি ও মোট খরচের হিসাব।", icon: "💰", href: "/applications" },
  { key: "processing-time", name: "সময় পূর্বাভাস", group: "ভিসা ইন্টেলিজেন্স", desc: "পিক ও অফ-পিক সিজন অনুযায়ী প্রসেসিং সময়।", icon: "⏱️", href: "/applications" },
  { key: "rule-matching", name: "দেশভিত্তিক নিয়ম মেলানো", group: "ভিসা ইন্টেলিজেন্স", desc: "১৫টি দেশের সর্বশেষ শর্ত ও স্পন্সরশিপ নিয়ম।", icon: "🌍", href: "/research" },
  { key: "policy-search", name: "নীতি অনুসন্ধান", group: "ভিসা ইন্টেলিজেন্স", desc: "Exa ও Decodo সংযোগে সর্বশেষ নীতি ও সূত্র।", icon: "🔎", href: "/research" },
  { key: "appointment-finder", name: "অ্যাপয়েন্টমেন্ট অনুসন্ধান", group: "ভিসা ইন্টেলিজেন্স", desc: "নিকটতম খালি স্লট খুঁজে বুকিং পরিকল্পনা।", icon: "📅", href: "/automation" },

  { key: "cover-letter", name: "কভার লেটার", group: "ডকুমেন্ট", desc: "দূতাবাস-প্রস্তুত ইংরেজি কভার লেটার (PDF)।", icon: "✉️", href: "/documents" },
  { key: "employment-contract", name: "চাকরির চুক্তি", group: "ডকুমেন্ট", desc: "নিয়োগকর্তা-কর্মী চুক্তি DOCX ফরম্যাটে।", icon: "📝", href: "/documents" },
  { key: "sponsorship-letter", name: "স্পন্সরশিপ লেটার", group: "ডকুমেন্ট", desc: "নিয়োগকর্তার অঙ্গীকারনামা।", icon: "🤝", href: "/documents" },
  { key: "invoice", name: "ইনভয়েস ও রসিদ", group: "ডকুমেন্ট", desc: "ক্লায়েন্ট বিলিং ও পেমেন্ট নির্দেশনা।", icon: "🧾", href: "/documents" },
  { key: "checklist", name: "ডকুমেন্ট চেকলিস্ট", group: "ডকুমেন্ট", desc: "বাংলায় দেশভিত্তিক সম্পূর্ণ তালিকা।", icon: "✅", href: "/documents" },
  { key: "client-guide", name: "ক্লায়েন্ট নির্দেশিকা", group: "ডকুমেন্ট", desc: "ধাপে ধাপে বাংলা গাইড, স্কোরসহ।", icon: "📘", href: "/documents" },
  { key: "form-autofill", name: "ফর্ম অটো-ফিল", group: "ডকুমেন্ট", desc: "সরকারি ফর্মের ফিল্ড ম্যাপিং ডাটা শিট।", icon: "🗂️", href: "/documents" },

  { key: "portal-login", name: "পোর্টাল লগইন ও স্ট্যাটাস", group: "অটোমেশন", desc: "এম্বাসি পোর্টালে লগইন করে স্ট্যাটাস আনে।", icon: "🔐", href: "/automation" },
  { key: "form-filling", name: "অনলাইন ফর্ম পূরণ", group: "অটোমেশন", desc: "আবেদনকারীর ডাটা দিয়ে ফর্ম পূরণ ও জমা।", icon: "⌨️", href: "/automation" },
  { key: "work-permit", name: "ওয়ার্ক পারমিট ফাইলিং", group: "অটোমেশন", desc: "নিয়োগকর্তার পোর্টালে স্পন্সরশিপ আবেদন।", icon: "🏢", href: "/automation" },
  { key: "appointment-booking", name: "অ্যাপয়েন্টমেন্ট বুকিং", group: "অটোমেশন", desc: "স্লট খুঁজে বুক ও রিশিডিউল করে।", icon: "🗓️", href: "/automation" },
  { key: "doc-archive", name: "ডকুমেন্ট আর্কাইভ", group: "অটোমেশন", desc: "ডিসিশন লেটার ও রসিদ ডাউনলোড করে সাজায়।", icon: "📥", href: "/automation" },

  { key: "voice-call", name: "ভয়েস কল ও আইভিআর", group: "যোগাযোগ", desc: "স্বয়ংক্রিয় বাংলা কল ও মেনু।", icon: "📞", href: "/comms" },
  { key: "whatsapp", name: "হোয়াটসঅ্যাপ বার্তা", group: "যোগাযোগ", desc: "স্ট্যাটাস আপডেট ও রিমাইন্ডার।", icon: "🟢", href: "/comms" },
  { key: "messenger", name: "মেসেঞ্জার বট", group: "যোগাযোগ", desc: "ফেসবুক মেসেঞ্জারে স্বয়ংক্রিয় উত্তর।", icon: "💬", href: "/comms" },
  { key: "instagram-dm", name: "ইনস্টাগ্রাম ডিএম", group: "যোগাযোগ", desc: "ইনবক্সে তাৎক্ষণিক বাংলা উত্তর।", icon: "📷", href: "/comms" },
  { key: "email-reply", name: "ইমেইল অটো-রিপ্লাই", group: "যোগাযোগ", desc: "অনুসন্ধানের উত্তর ও ফলো-আপ।", icon: "📧", href: "/comms" },

  { key: "social-post", name: "সোশ্যাল পোস্ট তৈরি", group: "মার্কেটিং ও শিডিউল", desc: "৬টি প্ল্যাটফর্মের জন্য বাংলা কনটেন্ট।", icon: "📣", href: "/social" },
  { key: "post-schedule", name: "পোস্ট শিডিউল", group: "মার্কেটিং ও শিডিউল", desc: "নির্ধারিত সময়ে স্বয়ংক্রিয় প্রকাশ।", icon: "⏰", href: "/social" },
  { key: "engagement", name: "এনগেজমেন্ট বিশ্লেষণ", group: "মার্কেটিং ও শিডিউল", desc: "লাইক, শেয়ার ও রিচের হিসাব।", icon: "📈", href: "/social" },
  { key: "daily-news", name: "দৈনিক ভিসা সংবাদ", group: "মার্কেটিং ও শিডিউল", desc: "প্রতিদিন সকালে নীতি আপডেট পাঠায়।", icon: "🗞️", href: "/automation" },
  { key: "deadline-reminder", name: "ডেডলাইন রিমাইন্ডার", group: "মার্কেটিং ও শিডিউল", desc: "ডকুমেন্ট জমার সময়সীমা মনে করায়।", icon: "⚠️", href: "/automation" },
  { key: "business-summary", name: "ব্যবসায়িক সারসংক্ষেপ", group: "মার্কেটিং ও শিডিউল", desc: "সাপ্তাহিক ও মাসিক কেপিআই রিপোর্ট।", icon: "📑", href: "/automation" },
];
