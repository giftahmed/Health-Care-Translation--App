import { useState, useRef, useEffect } from 'react';
import styles from '../styles/style.module.css'; // Import the CSS module

// Fix: Use type assertion on window to access SpeechRecognition properties
const SpeechRecognition =
  typeof window !== 'undefined'
    ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
    : null;

export default function Home() {
  const [originalText, setOriginalText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [modelUsed, setModelUsed] = useState<string>('');
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const [sourceLang, setSourceLang] = useState('en-US');
  const [targetLang, setTargetLang] = useState('es');

  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = sourceLang;

      recognitionRef.current.onresult = async (event: SpeechRecognitionEvent) => {
        const transcript = event.results[0][0].transcript;
        setOriginalText(transcript);
        await handleTranslation(transcript);
      };

      recognitionRef.current.onerror = (error: any) => {
        console.error("Speech recognition error:", error);
        setIsRecording(false);
      };
    }
  }, [sourceLang]);

  const toggleRecording = () => {
    if (!SpeechRecognition) {
      alert("Speech Recognition is not supported in this browser.");
      return;
    }
    if (!isRecording) {
      setOriginalText('');
      setTranslatedText('');
      setWarnings([]);
      setModelUsed('');
      setIsRecording(true);
      recognitionRef.current.start();
    } else {
      setIsRecording(false);
      recognitionRef.current.stop();
    }
  };

  const handleTranslation = async (text: string) => {
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, targetLang }),
      });
      const data = await res.json();
      if (data?.translatedText) {
        setTranslatedText(data.translatedText);
        setWarnings(data.warnings || []);
        setModelUsed(data.modelUsed || '');
      } else {
        setTranslatedText("Translation failed. Please try again.");
        setWarnings([]);
        setModelUsed('');
      }
    } catch (error) {
      console.error("Translation API error:", error);
      setTranslatedText("Translation error occurred.");
      setWarnings([]);
      setModelUsed('');
    }
  };

  const playAudio = () => {
    if (!translatedText) return;
    const utterance = new SpeechSynthesisUtterance(translatedText);
    utterance.lang = targetLang;
    setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
    };
    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  return (
    <div>
      {/* Header */}
      <header className={styles.header}>
        <div>
          <h1 className={styles.header__title}>My Account</h1>
          <p className={styles.header__subtitle}>Welcome, Gift A</p>
        </div>
        <button className={styles.header__btn}>
          <span>Profile</span>
        </button>
      </header>

      {/* Main Section */}
      <main className={styles.main}>
        {/* Optional wave background */}
        <svg viewBox="0 0 1440 320" className={styles.wave} preserveAspectRatio="none">
          <path d="M0,224L30,234.7C60,245,120,267,180,250.7C240,235,300,181,360,160C420,139,480,149,540,138.7C600,128,660,96,720,117.3C780,139,840,213,900,234.7C960,256,1020,224,1080,186.7C1140,149,1200,107,1260,122.7C1320,139,1380,213,1410,250.7L1440,288L1440,320L1410,320C1380,320,1320,320,1260,320C1200,320,1140,320,1080,320C1020,320,960,320,900,320C840,320,780,320,720,320C660,320,600,320,540,320C480,320,420,320,360,320C300,320,240,320,180,320C120,320,60,320,30,320L0,320Z" />
        </svg>

        <div className={styles.contentWrapper}>
          <h2 className={styles.mainTitle}>Healthcare Translation Web App with Generative AI!</h2>
          <p className={styles.mainSubtitle}>Please explain this word</p>

          <button
            onClick={toggleRecording}
            className={
              isRecording
                ? `${styles.micButton} ${styles['micButton--recording']}`
                : `${styles.micButton} ${styles['micButton--idle']}`
            }
          >
            {/* Microphone Icon */}
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 9v3a3 3 0 006 0V9a3 3 0 00-6 0z
                   M19 10v2a7 7 0 01-14 0v-2
                   m7 8v2m0 0h-4m4 0h4"
              />
            </svg>
          </button>

          <div className={styles.langContainer}>
            <div>
              <label className={styles.langLabel}>Source</label>
              <select
                value={sourceLang}
                onChange={(e) => setSourceLang(e.target.value)}
                className={styles.langSelect}
              >
                <option value="en-US">English</option>
                <option value="es-ES">Spanish</option>
                <option value="fr-FR">French</option>
              </select>
            </div>
            <div>
              <label className={styles.langLabel}>Target</label>
              <select
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value)}
                className={styles.langSelect}
              >
                <option value="es">Spanish</option>
                <option value="en-US">English</option>
                <option value="fr-FR">French</option>
              </select>
            </div>
          </div>
        </div>
      </main>

      {/* Bottom Panel */}
      <section className={styles.bottomPanel}>
        <div className={styles.bottomPanel__inner}>
          {/* Original Transcript Card */}
          <div className={styles.card}>
            <h3 className={styles.card__title}>Original Transcript</h3>
            <p className={styles.card__text}>
              {originalText || "Waiting for input..."}
            </p>
          </div>

          {/* Translated Transcript Card */}
          <div className={styles.card}>
            <h3 className={styles.card__title}>Translated Text</h3>
            <p className={styles.card__text}>
              {translatedText || "Translation will appear here."}
            </p>

            {/* Warnings & Model Info */}
            {translatedText && (
              <div className={styles.warnings}>
                {warnings.length > 0 && (
                  <>
                    <h4 className={styles.warnings__title}>Translation Warnings:</h4>
                    <ul className={styles.warnings__list}>
                      {warnings.map((warning, i) => (
                        <li key={i}>{warning}</li>
                      ))}
                    </ul>
                  </>
                )}
                {modelUsed && (
                  <p className={styles.modelUsed}>
                    <strong>Model Used:</strong> {modelUsed}
                  </p>
                )}
              </div>
            )}

            {/* Speak / Stop Speaking Buttons */}
            {translatedText && (
              <div className={styles.btnGroup}>
                <button onClick={playAudio} className={styles.speakBtn}>
                  Speak
                </button>
                {isSpeaking && (
                  <button onClick={stopSpeaking} className={styles.stopBtn}>
                    Stop
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
