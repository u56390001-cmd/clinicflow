import type { InstrumentTranslationPack } from "@/lib/assessments/translations";

/**
 * PHQ-9 (Patient Health Questionnaire, public domain) with Urdu Nastaliq and
 * Roman Urdu item text for the patient portal. Option table is the shared
 * PHQ-9/GAD-7 frequency scale.
 */
export const PHQ9_TRANSLATIONS: InstrumentTranslationPack = {
  code: "PHQ-9",
  instructions: {
    en: "Over the last 2 weeks, how often have you been bothered by any of the following problems?",
    ur: "پچھلے دو ہفتوں میں آپ کو درج ذیل مسائل نے کتنی بار پریشان کیا؟",
    roman_ur:
      "Pichhle 2 hafton mein in masail ne aapko kitni baar pareshan kiya?",
  },
  items: {
    phq9_1: {
      en: "Little interest or pleasure in doing things",
      ur: "کام کاج میں دل نہ لگنا یا لطف نہ آنا",
      roman_ur: "Kisi kaam mein dil na lagna ya maza na aana",
    },
    phq9_2: {
      en: "Feeling down, depressed, or hopeless",
      ur: "اداس، مایوس یا ناامید محسوس کرنا",
      roman_ur: "Udaas, mayoos ya na-umeed mehsoos karna",
    },
    phq9_3: {
      en: "Trouble falling or staying asleep, or sleeping too much",
      ur: "سونے میں دقت، نیند نہ آنا یا بہت زیادہ سونا",
      roman_ur: "Sone mein dushwari, neend na aana ya bohat zyada sona",
    },
    phq9_4: {
      en: "Feeling tired or having little energy",
      ur: "تھکاوٹ محسوس کرنا یا توانائی کی کمی",
      roman_ur: "Thakan mehsoos karna ya tawanai ki kami",
    },
    phq9_5: {
      en: "Poor appetite or overeating",
      ur: "بھوک نہ لگنا یا ضرورت سے زیادہ کھا لینا",
      roman_ur: "Bhook na lagna ya zaroorat se zyada kha lena",
    },
    phq9_6: {
      en: "Feeling bad about yourself — or that you are a failure or have let yourself or your family down",
      ur: "اپنے بارے میں برا محسوس کرنا۔ یا یہ احساس کہ آپ ناکام ہیں یا اپنے خاندان کا حوصلہ توڑ دیا",
      roman_ur:
        "Apne baare mein bura mehsoos karna, ya aisa lagna ke ap naqam hain ya khandaan ka hosla tor diya",
    },
    phq9_7: {
      en: "Trouble concentrating on things, such as reading the newspaper or watching television",
      ur: "توجہ مرکوز کرنے میں دقت، مثلاً اخبار پڑھنا یا ٹی وی دیکھنا",
      roman_ur:
        "Tawajjoh markooz karne mein dushwari, masal akhbaar parhna ya TV dekhna",
    },
    phq9_8: {
      en: "Moving or speaking so slowly that other people could have noticed? Or being so fidgety or restless that you have been moving around a lot more than usual",
      ur: "اتنا آہستہ چلنا یا بولنا کہ دوسرے محسوس کریں۔ یا اتنی بے چینی کہ آپ معمول سے کہیں زیادہ حرکت کر رہے ہوں",
      roman_ur:
        "Itna aahista chalna ya bolna ke doosre mehsoos karein. Ya itni bechaini ke aap mamool se kahin zyada harkat kar rahe hain",
    },
    phq9_9: {
      en: "Thoughts that you would be better off dead or of hurting yourself in some way",
      ur: "یہ خیالات کہ مُردہ بہتر ہوتے یا خود کو کسی نہ کسی طرح نقصان پہنچاتے",
      roman_ur:
        "Ye khayal ke marne behtar hota ya khud ko kisi na kisi tarah nuqsan pohanchata",
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
