import type { NextApiRequest, NextApiResponse } from 'next';
import enGlossary from '../../data/en.json';
import esGlossary from '../../data/es.json';

interface TranslateRequest {
  text: string;
  targetLang: string;
}

// A type for glossary entries used during pre- and post-processing
interface GlossaryEntry {
  placeholder: string;
  term: string;
}

// Helper function to sanitize sensitive input
function sanitizeInput(text: string): string {
  // Example: remove any "patient: <word>" patterns
  return text.replace(/(patient:\s*\w+)/gi, "patient: [redacted]");
}

// Load glossaries from JSON files.
// The JSON files contain an array under "medicalTerms"
const MEDICAL_GLOSSARY: Record<string, { medicalTerms: string[] }> = {
  en: enGlossary,
  es: esGlossary
  // Add other languages as needed...
};

// Validation patterns
const DOSAGE_REGEX = /(\d+\s*(mg|mL|g|μg|mcg|IU)\b)/gi;
const ANATOMICAL_TERMS = ["heart", "liver", "kidney"]; // Expand with more terms

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text, targetLang } = req.body as TranslateRequest;
  if (!text || !targetLang) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Sanitize input to remove sensitive data
    const sanitizedText = sanitizeInput(text);

    // Pre-process the text using the English glossary
    const { processedText, glossaryEntries } = preProcessText(sanitizedText);

    // Try primary translation model
    let result = await translateWithModel(processedText, targetLang, 'llama3-70b-8192');

    // Fallback to secondary model if needed
    if (!result.translatedText) {
      result = await translateWithModel(processedText, targetLang, 'mixtral-8x7b-32768');
    }

    // Post-process the translation to restore glossary terms in the target language
    const finalTranslation = postProcessText(result.translatedText, glossaryEntries, targetLang);

    // Validate the translation and produce warnings if necessary
    const warnings = validateTranslation(sanitizedText, finalTranslation, targetLang);

    res.status(200).json({
      translatedText: finalTranslation,
      warnings,
      modelUsed: result.modelUsed
    });
  } catch (error) {
    console.error("Translation error:", error);
    res.status(500).json({ error: 'Translation failed' });
  }
}

// --- Helper Functions ---

/**
 * Pre-processes the text by replacing any occurrences of English medical terms with placeholders.
 * Returns the processed text and an array of glossary entries for later restoration.
 */
function preProcessText(text: string) {
  const glossaryEntries: GlossaryEntry[] = [];
  let processedText = text;
  const sourceTerms: string[] = MEDICAL_GLOSSARY['en'].medicalTerms || [];

  sourceTerms.forEach(term => {
    const regex = new RegExp(term, 'gi');
    if (regex.test(processedText)) {
      const placeholder = `GLOSSARY_${term.toUpperCase()}`;
      processedText = processedText.replace(regex, placeholder);
      glossaryEntries.push({ placeholder, term });
    }
  });

  return { processedText, glossaryEntries };
}

/**
 * Post-processes the translated text by replacing placeholders with the corresponding target language terms.
 * It uses the order of terms in the source and target glossaries.
 */
function postProcessText(
  text: string,
  glossaryEntries: GlossaryEntry[],
  targetLang: string
) {
  let processedText = text;
  const targetTerms: string[] = MEDICAL_GLOSSARY[targetLang].medicalTerms || [];

  glossaryEntries.forEach(({ placeholder, term }) => {
    // Find the index of the term in the English glossary
    const index = (MEDICAL_GLOSSARY['en'].medicalTerms || []).findIndex(
      t => t.toLowerCase() === term.toLowerCase()
    );
    // Get the corresponding term from the target glossary if available; otherwise, fallback to the original term
    const translatedTerm: string = (index !== -1 && targetTerms[index]) ?? term;
    // Replace the placeholder with the translated term
    processedText = processedText.replace(new RegExp(placeholder, 'gi'), translatedTerm);
  });

  return processedText;
}

/**
 * Validates the translation by comparing dosage values, anatomical terms, and units between the source and translated text.
 */
function validateTranslation(source: string, translation: string, targetLang: string) {
  const warnings: string[] = [];

  // Validate dosages
  const sourceDosages = source.match(DOSAGE_REGEX) || [];
  const translatedDosages = translation.match(DOSAGE_REGEX) || [];
  if (sourceDosages.join(',') !== translatedDosages.join(',')) {
    warnings.push('Potential dosage discrepancy detected');
  }

  // Validate anatomical terms
  ANATOMICAL_TERMS.forEach(term => {
    if (source.toLowerCase().includes(term) && !translation.toLowerCase().includes(term)) {
      warnings.push(`Anatomical term '${term}' might be mistranslated`);
    }
  });

  // Validate units
  const invalidUnits = (translation.match(/(mg|mL|g)/gi) || []).filter(unit => {
    return !['mg', 'mL', 'g'].includes(unit.toLowerCase());
  });
  if (invalidUnits.length > 0) {
    warnings.push(`Invalid units detected: ${invalidUnits.join(', ')}`);
  }

  return warnings;
}

/**
 * Calls the external translation API (via the GROQ API) using the provided generative model.
 */
async function translateWithModel(text: string, targetLang: string, model: string) {
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: `Translate medical text to ${targetLang} exactly. Preserve numbers, units, and medical terms.`
          },
          {
            role: "user",
            content: text
          }
        ],
        temperature: 0.1,
        max_tokens: 1024
      })
    });
    const data = await response.json();
    return {
      translatedText: data.choices?.[0]?.message?.content?.trim() || '',
      modelUsed: model
    };
  } catch (error) {
    console.error(`Error with model ${model}:`, error);
    return { translatedText: '', modelUsed: model };
  }
}
