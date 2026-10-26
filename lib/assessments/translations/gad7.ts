import type { InstrumentTranslationPack } from "@/lib/assessments/translations";

/**
 * GAD-7 (public-domain 7-item anxiety screen) with Urdu Nastaliq and Roman
 * Urdu item text. Shares the PHQ-9 frequency option scale.
 */
export const GAD7_TRANSLATIONS: InstrumentTranslationPack = {
  code: "GAD-7",
  instructions: {
    en: "Over the last 2 weeks, how often have you been bothered by the following problems?",
    ur: "پچھلے دو ہفتوں میں درج ذیل مسائل نے آپ کو کتنی بار پریشان کیا؟",
    roman_ur:
      "Pichhle 2 hafton mein ye masail aapko kitni baar pareshan karte rahe?",
  },
  items: {
    gad7_1: {
      en: "Feeling nervous, anxious, or on edge",
      ur: "بے چینی، پریشانی یا پُرگھبراہٹ محسوس کرنا",
      roman_ur: "Bechaini, preshani ya pur-ghabrahat mehsoos karna",
    },
    gad7_2: {
      en: "Not being able to stop or control worrying",
      ur: "فکر و اضطراب کو روکنے یا قابو کرنے میں ناکامی",
      roman_ur: "Fikr ko rokne ya qabu mein karne mein naqami",
    },
    gad7_3: {
      en: "Worrying too much about different things",
      ur: "مختلف باتوں پر حد سے زیادہ فکر کرنا",
      roman_ur: "Mukhtalif batoon par had se zyada fikar karna",
    },
    gad7_4: {
      en: "Trouble relaxing",
      ur: "سکون حاصل کرنے میں دقت",
      roman_ur: "Aaram ya sukoon hasil karne mein dushwari",
    },
    gad7_5: {
      en: "Being so restless that it is hard to sit still",
      ur: "اتنی بے چینی کہ ایک جگہ بیٹھنا دشوار ہو",
      roman_ur: "Itni bechaini ke ek jagah bethna mushkil ho",
    },
    gad7_6: {
      en: "Becoming easily annoyed or irritable",
      ur: "آسانی سے چڑچڑا ہو جانا یا غصہ کر بیٹھنا",
      roman_ur: "Aasani se chid-chida ya ajeeb-o-gareeb naraz ho jana",
    },
    gad7_7: {
      en: "Feeling afraid as if something awful might happen",
      ur: "ایسا خوف محسوس کرنا جیسے کوئی وحشیانہ واقعہ پیش آ سکتا ہے",
      roman_ur:
        "Aisa khauf mehsoos karna jaise koi bura waqia pre a sakta ho",
    },
  },
  options: {
    0: { en: "Not at all", ur: "بالکل نہیں", roman_ur: "Bilkul nahi" },
    1: { en: "Several days", ur: "چند دن", roman_ur: "Kuch din" },
    2: {
      en: "More than half the days",
      ur: "آدھے سے زیادہ دن",
      roman_ur: "Aadhay se zyada din",
    },
    3: {
      en: "Nearly every day",
      ur: "تقریباً ہر روز",
      roman_ur: "Taqreeban rozana",
    },
  },
};
