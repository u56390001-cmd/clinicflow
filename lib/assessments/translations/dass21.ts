import type { InstrumentTranslationPack } from "@/lib/assessments/translations";

/**
 * DASS-21 short form (public-domain Lovibond & Lovibond, 1995 text) with Urdu
 * Nastaliq and Roman Urdu item text. Option labels follow the published anchors.
 * Scoring itself stays untouched — translations are display-only.
 */
export const DASS21_TRANSLATIONS: InstrumentTranslationPack = {
  code: "DASS-21",
  instructions: {
    en: "Over the past week, how much did each statement apply to you? There are no right or wrong answers.",
    ur: "پچھلے ہفتے ہر جملہ آپ پر کتنی حد تک لاگو ہوا؟ کوئی جواب غلط نہیں ہے۔",
    roman_ur:
      "Pichhle haftay har jumla aap par kitni hadd tak laagu hua? Koi jawab ghalat nahi hai.",
  },
  items: {
    dass21_1: {
      en: "I found it hard to wind down",
      ur: "مجھے سکون آرام کرنا مشکل لگتا تھا",
      roman_ur: "Mujhe sukoon aaram karna mushkil lagta tha",
    },
    dass21_2: {
      en: "I was aware of dryness of my mouth",
      ur: "مجھے منہ کی خشکی محسوس ہو رہی تھی",
      roman_ur: "Mujhe munh ki khushki mehsoos ho rahi thi",
    },
    dass21_3: {
      en: "I couldn't seem to experience any positive feeling at all",
      ur: "مجھے کوئی مثبت احساس نہیں ہو پاتا تھا",
      roman_ur: "Mujhe koi positive ehsas hi nahi ho pata tha",
    },
    dass21_4: {
      en: "I experienced breathing difficulty (e.g. excessively rapid breathing, breathlessness in the absence of physical exertion)",
      ur: "مجھے سانس لینے میں دقت ہوئی (مثلاً بہت تیز سانس، بغیر مشقت کے ہانپ آنا)",
      roman_ur:
        "Mujhe saans lene mein dushwari hui (misal bohat tez saans, bina mehnat ke haanp aana)",
    },
    dass21_5: {
      en: "I found it difficult to work up the initiative to do things",
      ur: "کچھ کرنے کے لیے حوصلہ جٹانا مشکل لگتا تھا",
      roman_ur: "Kuch karne ke liye hosla jutaana mushkil lagta tha",
    },
    dass21_6: {
      en: "I tended to over-react to situations",
      ur: "میں حالات پر حد سے زیادہ ردِعمل دیتا تھا",
      roman_ur: "Main halaat par had se zyada re-action deta tha",
    },
    dass21_7: {
      en: "I experienced trembling (e.g. in the hands)",
      ur: "مجھے کپکپاہٹ محسوس ہوئی (مثلاً ہاتھوں میں)",
      roman_ur: "Mujhe kap-kapahat mehsoos hui (masal hathoon mein)",
    },
    dass21_8: {
      en: "I felt that I was using a lot of nervous energy",
      ur: "مجھے لگتا تھا کہ میں بہت زیادہ اعصابی توانائی لگا رہا ہوں",
      roman_ur:
        "Mujhe lagta tha ke main bohat zyada aasaabi tawanai laga raha hoon",
    },
    dass21_9: {
      en: "I was worried about situations in which I might panic and make a fool of myself",
      ur: "مجھے اُن صورتوں کی فکر تھی جن میں میں گھبرا کر بیچارہ بن سکتا تھا",
      roman_ur:
        "Mujhe un sooraton ki fikr thi jin mein main ghabra ke bechara ban sakta tha",
    },
    dass21_10: {
      en: "I felt that I had nothing to look forward to",
      ur: "مجھے لگتا تھا کہ میرے آگے کوئی خوشی/امید نہیں",
      roman_ur: "Mujhe lagta tha ke mere aage koi khushi ya umeed nahi",
    },
    dass21_11: {
      en: "I found myself getting agitated",
      ur: "میں چڑ چڑا ہوتا جاتا تھا",
      roman_ur: "Main chid-chida hota jata tha",
    },
    dass21_12: {
      en: "I found it difficult to relax",
      ur: "مجھے ذہنی سکون لانا مشکل لگتا تھا",
      roman_ur: "Mujhe dhaini sukoon lana mushkil lagta tha",
    },
    dass21_13: {
      en: "I felt down-hearted and blue",
      ur: "میں اداس اور فرسودہ محسوس کرتا تھا",
      roman_ur: "Main udaas aur fringeela mehsoos karta tha",
    },
    dass21_14: {
      en: "I was intolerant of anything that kept me from getting on with what I was doing",
      ur: "جو چیز کام میں رکاوٹ بنتی، اُس سے مجھے مشکل پیش آتی تھی",
      roman_ur:
        "Jo cheez kaam mein rukawat banti, us se mujhe sakht pareshani hoti thi",
    },
    dass21_15: {
      en: "I felt I was close to panic",
      ur: "مجھے لگا کہ میں گھبراہٹ کے قریب ہوں",
      roman_ur: "Mujhe laga ke main ghabrahat ke qareeb hoon",
    },
    dass21_16: {
      en: "I was unable to become enthusiastic about anything",
      ur: "میں کسی چیز میں شوق نہ قائم کر سکا",
      roman_ur: "Main kisi cheez mein shauq qaim nahi kar saka",
    },
    dass21_17: {
      en: "I felt I wasn't worth much as a person",
      ur: "مجھے لگتا تھا کہ ایک انسان کی حیثیت سے میری کوئی اہمیت نہیں",
      roman_ur:
        "Mujhe lagta tha ke ek insaan ki haisiyat se meri koi ahmiyat nahi",
    },
    dass21_18: {
      en: "I felt that I was rather touchy",
      ur: "مجھے لگتا تھا کہ میں خاصا چڑچڑا ہوں",
      roman_ur: "Mujhe lagta tha ke main khasa chid-chida hoon",
    },
    dass21_19: {
      en: "I was aware of the action of my heart in the absence of physical exertion (e.g. sense of heart rate increase, heart missing a beat)",
      ur: "بغیر جسمانی مشقت کے مجھے دل کی دھڑکن محسوس ہوتی تھی (مثلاً تیز دھڑکن، ایک دھڑکن رکنا)",
      roman_ur:
        "Bina jismani mehnat ke mujhe dil ki dhadkan mehsoos hoti thi (misal tez dhadkan, ek dhadkan ruk jana)",
    },
    dass21_20: {
      en: "I felt scared without any good reason",
      ur: "بغیر کسی وجہ کے مجھے خوف محسوس ہوتا",
      roman_ur: "Bina kisi wajah ke mujhe khauf mehsoos hota",
    },
    dass21_21: {
      en: "I felt that life was meaningless",
      ur: "مجھے لگتا تھا کہ زندگی بے معنی ہے",
      roman_ur: "Mujhe lagta tha ke zindagi be-maani hai",
    },
  },
  options: {
    0: {
      en: "Did not apply to me at all",
      ur: "مجھ پر بالکل لاگو نہیں ہوا",
      roman_ur: "Mujh par bilkul laagu nahi hua",
    },
    1: {
      en: "Applied to me to some degree, or some of the time",
      ur: "کسی حد تک لاگو ہوا",
      roman_ur: "Kisi hadd tak laagu hua",
    },
    2: {
      en: "Applied to me to a considerable degree, or a good part of the time",
      ur: "کافی حد تک لاگو ہوا",
      roman_ur: "Kaafi hadd tak laagu hua",
    },
    3: {
      en: "Applied to me very much, or most of the time",
      ur: "بہت زیادہ لاگو ہوا",
      roman_ur: "Bohat zyada laagu hua",
    },
  },
};
