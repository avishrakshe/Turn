# Translations to review

Every non-English string below was drafted by machine and has **not** been checked by a native
speaker yet. Please review each one, fix it in place, and tick it off. Keep amounts and names as they are.
In the Urdu strings, amounts are wrapped in invisible left-to-right isolate marks (U+2066/U+2069);
leave those in place.

## App UI (`site/lib/i18n/{hi,ml,ta,ur}.ts`)

Every string in the app, one file per language, laid out exactly like `en.ts`. Easiest to review
side by side with `en.ts`, or in the app itself: Settings → Language.

- Keep every `{placeholder}` exactly as it is (a test fails if one is dropped or renamed). A
  language's `one` form may leave out `{count}` if that reads better ("एक महीना").
- Hindi, Malayalam and Tamil keep Latin digits; Urdu does too (members in India and the Gulf read
  amounts that way). Amounts, names and links are direction-isolated at runtime in Urdu, so no
  marks are needed in the catalog.
- Word choice for the circle itself: कमेटी (hi), ചിട്ടി (ml), சீட்டு (ta), کمیٹی (ur).

- [ ] **Hindi (hi)**: `site/lib/i18n/hi.ts`
- [ ] **Malayalam (ml)**: `site/lib/i18n/ml.ts`
- [ ] **Tamil (ta)**: `site/lib/i18n/ta.ts`
- [ ] **Urdu (ur), RTL**: `site/lib/i18n/ur.ts`

## Landing page: reminder previews (`site/components/marketing/Languages.tsx`)

English source: "Reminder: your ₹5,000 for Family Circle goes out automatically tomorrow. This month the pot goes to Fatima."

- [ ] **Hindi (hi):** याद दिला दें: फ़ैमिली सर्कल के लिए आपके ₹5,000 कल अपने-आप जमा हो जाएँगे। इस महीने की रकम फ़ातिमा को मिलेगी।
- [ ] **Malayalam (ml), AED:** ഓർമ്മപ്പെടുത്തൽ: ഫാമിലി സർക്കിളിലേക്കുള്ള നിങ്ങളുടെ AED 220 നാളെ സ്വയമേവ അടയ്ക്കും. ഈ മാസത്തെ തുക ഫാത്തിമയ്ക്ക് ലഭിക്കും.
- [ ] **Tamil (ta):** நினைவூட்டல்: ஃபேமிலி சர்க்கிளுக்கான உங்கள் ₹5,000 நாளை தானாகச் செலுத்தப்படும். இந்த மாதத் தொகை ஃபாத்திமாவுக்குக் கிடைக்கும்.
- [ ] **Urdu (ur), AED, RTL:** یاد دہانی: فیملی سرکل کے لیے آپ کے AED 220 کل خود بخود ادا ہو جائیں گے۔ اس مہینے کی رقم فاطمہ کو ملے گی۔

## Design system specimens (`site/app/design/page.tsx`)

Type specimens only, not shown to users. Review is still welcome.

- [ ] hi: आपकी बारी है। इस महीने की रकम ₹25,000 है।
- [ ] ml: നിങ്ങളുടെ ഊഴമാണ്. ഈ മാസത്തെ തുക ₹25,000.
- [ ] ta: உங்கள் முறை. இந்த மாதத் தொகை ₹25,000.
- [ ] ur: آپ کی باری ہے۔ اس مہینے کی رقم ₹25,000 ہے۔
