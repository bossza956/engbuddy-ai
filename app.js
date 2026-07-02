/**
 * EngBuddy AI - Application Logic Script
 * เขียนด้วย Vanilla JS มีการจัดระเบียบตามโมดูลหลัก เพื่อให้ทำงานได้บนเบราว์เซอร์โดยตรง
 */

// ==========================================================================
// 0. FIREBASE SYNCHRONIZATION CONFIGURATION (การตั้งค่าเชื่อมต่อ Firebase)
// ==========================================================================
const firebaseConfig = {
  apiKey: "AIzaSyCXSWM419rJYrzi-ICFj9HJxWLiPICbJHc",
  authDomain: "l-boss.firebaseapp.com",
  projectId: "l-boss",
  storageBucket: "l-boss.firebasestorage.app",
  messagingSenderId: "1038706773779",
  appId: "1:1038706773779:web:454286f6d789fd6280d4e6",
  measurementId: "G-R3MST7FWGY"
};

let db = null;
let firebaseEnabled = false;

try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    firebaseEnabled = true;
    
    // ตั้งค่า Offline Persistence ให้รองรับการบันทึกแม้ออฟไลน์
    db.enablePersistence().catch(err => {
        if (err.code == 'failed-precondition') {
            console.warn("Multiple tabs open, Firebase persistence disabled.");
        } else if (err.code == 'unimplemented') {
            console.warn("Browser doesn't support Firebase persistence.");
        }
    });

    if (window.location.protocol.startsWith('http')) {
        firebase.analytics();
    }
} catch (e) {
    console.error("Firebase Initialization Error:", e);
}

// ==========================================================================
// 1. STATE CONFIGURATION (การจัดการสถานะและข้อมูลของแอป)
// ==========================================================================
const state = {
    apiKey: '',
    savedSentences: [],
    learnedSentences: [],
    vocabBank: [],
    savedStories: [], // ลิสต์เรื่องเล่าที่ถูกบันทึก
    audioSpeed: 0.9, // ความเร็วการอ่านออกเสียงเริ่มต้น
    audioVoice: '', // ชื่อเสียงพูดที่เลือกใช้งาน
    xp: 0, // แต้มประสบการณ์
    level: 1, // ระดับเลเวล
    streak: 0, // วันล็อกอินต่อเนื่อง
    lastActiveDate: '', // วันที่ใช้งานล่าสุด
    userId: 'bossza956', // รหัสผู้ใช้สำหรับระบบคลาวด์ซิงค์เริ่มต้น
    updatedAt: 0, // วันที่อัปเดตล่าสุดสำหรับการซิงค์ข้อมูล
    
    // สำหรับ Story Reader
    currentStory: null,
    
    // สำหรับ Custom Reader
    currentReader: null,
    readerReadCompleted: false,
    
    // สำหรับ Flashcards
    currentCardIndex: 0,
    isCardFlipped: false,
    
    // สำหรับ Quiz
    currentQuizIndex: 0,
    currentQuizSentence: null,
    currentQuizAnswer: '', // คำตอบที่ถูกต้อง
    quizSelectedWords: [], // คำที่ผู้ใช้เลือกเรียง (สำหรับโหมดต่อคำ)
    quizOriginalWords: [], // คำดั้งเดิมของประโยค (สำหรับโหมดต่อคำ)
    quizCompletedSentences: [], // ประโยคที่ตอบควิซถูกต้องแล้วในเซสชันปัจจุบันเพื่อไม่ให้วนซ้ำ
    
    // สำหรับ Chat
    chatPersona: 'friend', // friend, coach, business
    chatHistory: [], // เก็บประวัติแชทล่าสุด [{role: 'user'|'model', parts: [{text: ''}]}]
};

// หัวข้อด่วนสำหรับสร้างเรื่องสั้น
const TOPIC_PROMPTS = {
    'A busy Coffee Shop': 'A busy morning in a cozy coffee shop. Someone is ordering coffee and bakery.',
    'A trip to Japan': 'A tourist exploring Tokyo, ordering food in a restaurant and taking a train.',
    'A conversation with a cute cat': 'A funny and sweet interaction between a human and a talking cat in a house.',
    'An exciting Job Interview': 'A candidate introducing themselves and answering a question about their strength during a job interview.',
    'Losing my wallet at the airport': 'A traveler realizing they lost their wallet at the airport and asking for help at the information desk.'
};

// บุคลิกของ AI Tutor
const PERSONA_CONFIGS = {
    'friend': {
        systemInstruction: "You are a friendly and casual English conversation partner named 'Buddy'. Chat with the user in English at an easy-to-understand level. Keep your replies short (2-3 sentences). IMPORTANT: If the user makes a grammatical mistake or uses awkward phrasing, at the very end of your response, write a separate section called '💡 Correction:' and explain the mistake and how to say it more naturally in simple Thai. Always be supportive."
    },
    'coach': {
        systemInstruction: "You are a professional, strict, yet highly encouraging English Grammar Coach. After each message from the user, analyze their text. Point out any grammar mistakes, spelling issues, or awkward word choices. Explain the rules behind these errors clearly in Thai. Then, provide 2 corrected versions of their sentence (Formal & Casual). Finally, ask a follow-up question in English to keep the conversation going."
    },
    'business': {
        systemInstruction: "You are a professional Business English Mentor. The user wants to practice English for workspace communication. Keep the conversation formal, polite, and corporate. After the user replies, suggest 1-2 ways to make their expression sound more professional (e.g. email etiquette, polite request), explain shortly in Thai, and continue the business discussion in English."
    }
};

// ==========================================================================
// 2. INITIALIZATION (จุดเริ่มต้นของระบบเมื่อเปิดเว็บ)
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    try {
        loadDataFromLocalStorage();
        setupNavigation();
        setupEventListeners();
        updateApiStatusDisplay();
        renderVocabBank();
        renderSavedStoriesList();
        renderSavedReadersList();
        updateStoryFilters();
        updateFlashcardStats();
        initFlashcards();
        loadSpeechVoices(); // โหลดตัวเลือกเสียงภาษาอังกฤษ
        checkDailyStreak(); // ตรวจสอบวันใช้งานต่อเนื่อง
        updateUserStatsUI(); // แสดงผลสถานะผู้ใช้
        
        // ตรวจสอบสถานะการเชื่อมต่อ API (จะทำงานผ่าน Proxy หรือ API Key ส่วนตัว)
        if (!state.apiKey) {
            showToast('ยินดีต้อนรับสู่ EngBuddy AI! (กำลังทำงานในโหมดเซิร์ฟเวอร์คลาวด์)', 'info');
        } else {
            showToast('ยินดีต้อนรับสู่ EngBuddy AI! (เชื่อมต่อผ่าน API Key ส่วนตัวของคุณ)', 'success');
        }
        
        // เริ่มต้นตรวจสอบความสอดคล้องและการซิงค์ข้อมูลกับคลาวด์อัตโนมัติ (หลังโหลดหน้า 3 วินาที)
        setTimeout(() => {
            try {
                autoSyncOnStartup();
            } catch(e) {
                console.error("AutoSync error on startup:", e);
            }
        }, 3000);
    } catch (error) {
        console.error("System initialization crashed:", error);
        showToast("เกิดข้อผิดพลาดในการโหลดระบบ: " + error.message, "error");
    }
});

// โหลดข้อมูลที่บันทึกไว้ในเครื่องคอมพิวเตอร์ของผู้ใช้
function loadDataFromLocalStorage() {
    try {
        state.apiKey = localStorage.getItem('engbuddy_api_key') || '';
        
        // โหลดรหัสผู้ใช้งาน (หากไม่มี หรือเป็นรหัสสุ่มดั้งเดิม eb_user_ ให้ใช้ค่าเริ่มต้นร่วมกันคือ 'bossza956')
        state.userId = localStorage.getItem('engbuddy_user_id') || '';
        if (!state.userId || state.userId.startsWith('eb_user_')) {
            state.userId = 'bossza956';
            try {
                localStorage.setItem('engbuddy_user_id', 'bossza956');
            } catch (e) {}
        }
        state.updatedAt = parseInt(localStorage.getItem('engbuddy_updated_at')) || 0;
        
        const syncInput = document.getElementById('sync-profile-id');
        if (syncInput) {
            syncInput.value = state.userId;
        }
        
        state.savedSentences = JSON.parse(localStorage.getItem('engbuddy_sentences')) || [];
        state.learnedSentences = JSON.parse(localStorage.getItem('engbuddy_learned')) || [];
        state.vocabBank = JSON.parse(localStorage.getItem('engbuddy_vocab')) || [];
        state.savedStories = JSON.parse(localStorage.getItem('engbuddy_saved_stories')) || [];
        state.audioSpeed = parseFloat(localStorage.getItem('engbuddy_audio_speed')) || 0.9;
        state.audioVoice = localStorage.getItem('engbuddy_audio_voice') || '';
        state.xp = parseInt(localStorage.getItem('engbuddy_xp')) || 0;
        state.level = parseInt(localStorage.getItem('engbuddy_level')) || 1;
        state.streak = parseInt(localStorage.getItem('engbuddy_streak')) || 0;
        state.lastActiveDate = localStorage.getItem('engbuddy_last_active') || '';
    } catch (e) {
        console.warn('Error reading from localStorage, using memory fallback:', e);
        state.apiKey = '';
        state.userId = 'bossza956';
        state.savedSentences = [];
        state.learnedSentences = [];
        state.vocabBank = [];
        state.savedStories = [];
        state.audioSpeed = 0.9;
        state.audioVoice = '';
        state.xp = 0;
        state.level = 1;
        state.streak = 0;
        state.lastActiveDate = '';
    }
    
    // ตั้งค่า Input ในหน้า Settings
    const keyInputEl = document.getElementById('settings-api-key');
    if (keyInputEl) {
        keyInputEl.value = state.apiKey;
    }
    
    const speedInput = document.getElementById('settings-audio-speed');
    if (speedInput) {
        speedInput.value = state.audioSpeed;
        const displayEl = document.getElementById('settings-audio-speed-display');
        if (displayEl) {
            displayEl.textContent = state.audioSpeed + 'x';
        }
    }
    updateUserStatsUI();
    
    // โหลดสถานะ Custom Reader เพิ่มเติม
    try {
        state.currentReader = JSON.parse(localStorage.getItem('engbuddy_current_reader')) || null;
        state.readerReadCompleted = localStorage.getItem('engbuddy_reader_read_completed') === 'true';
        if (state.currentReader) {
            renderReader(state.currentReader);
            const titleInput = document.getElementById('reader-title-input');
            if (titleInput) titleInput.value = state.currentReader.title || '';
        }
    } catch(e) {
        console.error('Error loading current reader state:', e);
    }
}

// บันทึกสถานะปัจจุบันลงเครื่องคอมพิวเตอร์
function saveDataToLocalStorage() {
    state.updatedAt = Date.now();
    localStorage.setItem('engbuddy_updated_at', state.updatedAt);
    
    localStorage.setItem('engbuddy_user_id', state.userId);
    localStorage.setItem('engbuddy_sentences', JSON.stringify(state.savedSentences));
    localStorage.setItem('engbuddy_learned', JSON.stringify(state.learnedSentences));
    localStorage.setItem('engbuddy_vocab', JSON.stringify(state.vocabBank));
    localStorage.setItem('engbuddy_saved_stories', JSON.stringify(state.savedStories));
    localStorage.setItem('engbuddy_audio_speed', state.audioSpeed);
    localStorage.setItem('engbuddy_audio_voice', state.audioVoice);
    localStorage.setItem('engbuddy_xp', state.xp);
    localStorage.setItem('engbuddy_level', state.level);
    localStorage.setItem('engbuddy_streak', state.streak);
    localStorage.setItem('engbuddy_last_active', state.lastActiveDate);
    
    // บันทึกสถานะ Custom Reader
    if (state.currentReader) {
        localStorage.setItem('engbuddy_current_reader', JSON.stringify(state.currentReader));
    } else {
        localStorage.removeItem('engbuddy_current_reader');
    }
    localStorage.setItem('engbuddy_reader_read_completed', state.readerReadCompleted);
    
    // อัปโหลดข้อมูลคลาวด์ซิงค์ Firebase แบบ Asynchronous
    saveDataToFirebase();
}

// อัปเดตสถานะของปุ่มเชื่อมต่อ API ในแถบเมนูข้างซ้าย
function updateApiStatusDisplay() {
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    
    if (!dot || !text) return;
    
    // เคลียร์ class เก่าให้กลับมาเป็นค่าเริ่มต้น
    dot.className = 'status-dot';
    
    if (state.apiKey) {
        dot.classList.add('active'); // สีเขียว
        text.textContent = 'เชื่อมต่อแล้ว (Key)';
    } else {
        dot.classList.add('proxy'); // สีฟ้า
        text.textContent = 'เชื่อมต่อแล้ว (Cloud)';
    }
}

// ==========================================================================
// 3. NAVIGATION & VIEW CONTROLLER (การสลับหน้าจอ)
// ==========================================================================
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetView = item.getAttribute('data-view');
            switchView(targetView);
        });
    });
}

function switchView(viewId) {
    // ซ่อนทุก Section
    const sections = document.querySelectorAll('.view-section');
    sections.forEach(sec => {
        sec.classList.remove('active-view');
    });
    
    // อัปเดตเมนูซ้ายมือ (Active Class)
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        if (item.getAttribute('data-view') === viewId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    // แสดงเฉพาะ Section ที่เลือก
    const targetSection = document.getElementById(`view-${viewId}`);
    if (targetSection) {
        targetSection.classList.add('active-view');
        state.activeView = viewId;
        
        // เคลียร์ความคืบหน้าบางหน้าเมื่อมีการสลับแท็บ
        if (viewId === 'flashcards') {
            updateStoryFilters();
            initFlashcards();
            updateFlashcardStats();
        } else if (viewId === 'challenges') {
            updateStoryFilters();
            initQuiz();
        } else if (viewId === 'words') {
            renderVocabBank();
        }
    }
}

// แสดงหน้าต่างแจ้งเตือนเล็กๆ (Toast Notification)
function showToast(message, type = 'success') {
    console.log(`[Toast ${type}]: ${message}`);
    // ปิดการแสดงผลป๊อปอัปแจ้งเตือนตามความต้องการของผู้ใช้เพื่อไม่ให้เกะกะหน้าจอ
    /*
    const toast = document.getElementById('toast-notification');
    const text = document.getElementById('toast-text');
    const icon = document.getElementById('toast-icon');
    
    text.textContent = message;
    
    // ปรับเปลี่ยนไอคอนและสไตล์ตามประเภท
    if (type === 'success') {
        toast.style.background = 'linear-gradient(135deg, #00b8ff, #00f5a0)';
        icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>';
    } else if (type === 'warning') {
        toast.style.background = 'linear-gradient(135deg, #ff7b00, #ffae00)';
        icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 9v2.25m9-2.248a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V5.25z"/>';
    } else { // error
        toast.style.background = 'linear-gradient(135deg, #ff007f, #8a2be2)';
        icon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>';
    }
    
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
    */
}

// ==========================================================================
// 4. API ENGINE (การเชื่อมต่อระบบ AI Gemini Pro)
// ==========================================================================
async function callGeminiAPI(prompt, systemInstruction = '', responseJson = false) {
    const workerUrl = "https://engbuddy-tts.natthapon-manat.workers.dev/gemini";
    
    const requestData = {
        contents: [{ parts: [{ text: prompt }] }]
    };
    
    if (systemInstruction) {
        requestData.systemInstruction = {
            parts: [{ text: systemInstruction }]
        };
    }
    
    if (responseJson) {
        requestData.generationConfig = {
            responseMimeType: "application/json",
            temperature: 0.2
        };
    }
    
    try {
        let url;
        if (state.apiKey) {
            // หากมี API Key ส่วนตัว ให้ใช้ยิงตรงหา Google
            url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${state.apiKey}`;
        } else {
            // หากไม่มี ให้ยิงผ่านระบบ Proxy ของ Cloudflare Worker ที่เก็บ Secret Key เอาไว้
            url = workerUrl;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });
        
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error?.message || `HTTP ${response.status}`);
        }
        
        const data = await response.json();
        const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!responseText) {
            throw new Error('ไม่พบข้อมูลการตอบกลับจาก AI');
        }
        
        return responseText;
    } catch (error) {
        console.error('Gemini API Error:', error);
        state.lastApiError = error.message; // เก็บข้อความข้อผิดพลาดล่าสุดไว้เพื่อใช้ตรวจสอบ
        showToast(`Gemini Error: ${error.message}`, 'error');
        return null;
    }
}

// ==========================================================================
// 5. SHORT STORIES MODULE (ระบบสร้างเรื่องเล่าและฝึกอ่าน)
// ==========================================================================
async function generateStory() {
    const topicInput = document.getElementById('story-topic-input').value.trim();
    const selectedLevel = document.getElementById('story-level').value;
    
    // กำหนดหัวข้อหลัก
    let topic = topicInput;
    if (!topic) {
        // หาปุ่ม tag ที่ถูกเลือก
        const activeTag = document.querySelector('.topic-tag.selected');
        topic = activeTag ? activeTag.textContent : 'Coffee Shop';
    }
    
    // แสดง loading
    const loading = document.getElementById('story-loading');
    const loadingText = document.getElementById('story-loading-text');
    loadingText.textContent = `กำลังแต่งเรื่องสั้นเรื่อง "${topic}" ระดับ ${selectedLevel}...`;
    loading.classList.add('active');
    
    // ออกแบบ Prompt พิเศษให้ส่งข้อมูลมาเป็น JSON
    const prompt = `Create a short, engaging story about "${topic}" in English suitable for an "${selectedLevel}" learner.
The story must be 4 to 6 sentences long, around 80-120 words in total.
For each sentence in the story, you must provide:
1. "english": The English sentence.
2. "thai": The accurate translation in Thai.
3. "vocabulary": A list of 1 to 2 key vocabulary words from that sentence. For each word, include:
   - "word": The vocabulary word itself.
   - "phonetic": The IPA phonetic notation (e.g., "/krɪsp/").
   - "meaning": The translation and brief definition in Thai.
4. "phrases": A list of 0 to 2 key word groupings, collocations, phrasal verbs, or idioms from that sentence (e.g., "look forward to", "set up"). For each, include:
   - "phrase": The phrase text.
   - "meaning": The meaning and translation of this phrase in Thai.

You must reply with ONLY a JSON object that strictly adheres to the following format. Do not include markdown codeblocks (like \`\`\`json) or any preamble/postamble.
JSON format:
{
  "title": "Story Title",
  "topic": "${topic}",
  "story_sentences": [
    {
      "english": "Sentence text here...",
      "thai": "แปลไทย...",
      "vocabulary": [
        {
          "word": "word",
          "phonetic": "/ipa/",
          "meaning": "แปลไทย"
        }
      ],
      "phrases": [
        {
          "phrase": "phrase text",
          "meaning": "แปลไทย"
        }
      ]
    }
  ]
}`;

    const rawResponse = await callGeminiAPI(prompt, "You are a professional, helpful English tutor and story teller.", true);
    loading.classList.remove('active');
    
    if (!rawResponse) return;
    
    try {
        // จัดระเบียบข้อความ เผื่อ Gemini ใส่ markdown block ครอบไว้
        let cleanText = rawResponse.trim();
        if (cleanText.startsWith('```json')) {
            cleanText = cleanText.substring(7);
        }
        if (cleanText.endsWith('```')) {
            cleanText = cleanText.substring(0, cleanText.length - 3);
        }
        cleanText = cleanText.trim();
        
        const storyData = JSON.parse(cleanText);
        storyData.id = 'story_' + Date.now();
        state.currentStory = storyData;
        
        renderStory(storyData);
    } catch (e) {
        console.error('Error parsing JSON story:', e, rawResponse);
        showToast('ไม่สามารถจัดระเบียบโครงสร้างเนื้อหาได้ กรุณากดปุ่มสร้างใหม่อีกครั้งครับ', 'error');
    }
}

// เรนเดอร์การแสดงผลเรื่องสั้น
function renderStory(storyData) {
    document.getElementById('story-placeholder').style.display = 'none';
    document.getElementById('story-display').style.display = 'block';
    
    document.getElementById('display-story-title').textContent = storyData.title;
    document.getElementById('display-story-badge').textContent = storyData.topic;
    
    // แสดงผลดาวระดับความชำนาญ
    const starsContainer = document.getElementById('display-story-stars');
    if (starsContainer) {
        starsContainer.innerHTML = '';
        const savedStory = state.savedStories.find(s => s.id === storyData.id);
        const starsCount = savedStory ? (savedStory.stars || 0) : 0;
        for (let i = 1; i <= 3; i++) {
            if (i <= starsCount) {
                starsContainer.innerHTML += '<span style="color: #ffd700; font-size: 1.1rem; text-shadow: 0 0 5px rgba(255,215,0,0.5);">★</span>';
            } else {
                starsContainer.innerHTML += '<span style="color: rgba(255,255,255,0.15); font-size: 1.1rem;">★</span>';
            }
        }
        if (starsCount === 3) {
            starsContainer.innerHTML += ' <span style="font-size: 0.75rem; color: #ffd700; font-weight: bold; text-shadow: 0 0 5px rgba(255,215,0,0.5);">Mastered 👑</span>';
        }
    }
    
    // อัปเดตปุ่มเซฟเรื่องเล่า
    const saveStoryBtn = document.getElementById('btn-save-story');
    const saveStoryText = document.getElementById('btn-save-story-text');
    if (saveStoryBtn && saveStoryText) {
        const isStorySaved = state.savedStories.some(s => s.id === storyData.id);
        if (isStorySaved) {
            saveStoryBtn.classList.add('saved');
            saveStoryText.textContent = 'บันทึกแล้ว';
        } else {
            saveStoryBtn.classList.remove('saved');
            saveStoryText.textContent = 'บันทึกเรื่องนี้';
        }
    }
    
    // อัปเดตปุ่มทบทวนบทเรียน
    const reviewContainer = document.getElementById('story-review-action-container');
    const reviewText = document.getElementById('btn-story-mark-read-text');
    const savedStory = state.savedStories.find(s => s.id === storyData.id);
    
    if (reviewContainer && reviewText) {
        if (savedStory) {
            reviewContainer.style.display = 'flex';
            const btn = reviewContainer.querySelector('button');
            if (savedStory.readMastery) {
                btn.style.background = 'rgba(255,255,255,0.05)';
                btn.style.borderColor = 'var(--glass-border)';
                btn.style.boxShadow = 'none';
                btn.disabled = true;
                reviewText.textContent = '🔊 ทบทวนและออกเสียงบทนี้ครบถ้วนแล้ว';
            } else {
                btn.style.background = 'var(--gradient-success)';
                btn.style.boxShadow = '0 4px 15px rgba(0, 184, 255, 0.3)';
                btn.disabled = false;
                reviewText.textContent = '🔊 ทบทวนและออกเสียงครบแล้ว (+15 XP)';
            }
        } else {
            reviewContainer.style.display = 'none';
        }
    }
    
    const container = document.getElementById('story-sentences-container');
    container.innerHTML = '';
    
    storyData.story_sentences.forEach((sentence, index) => {
        // สร้างเอกลักษณ์ของประโยค
        const sentenceId = `sentence_${Date.now()}_${index}`;
        
        // เช็คว่าประโยคนี้เคยเซฟไว้หรือยัง
        const isAlreadySaved = state.savedSentences.some(s => s.english.trim().toLowerCase() === sentence.english.trim().toLowerCase());
        
        const sentenceBlock = document.createElement('div');
        sentenceBlock.className = 'sentence-block';
        sentenceBlock.innerHTML = `
            <div class="sentence-top-row">
                <span class="sentence-text">${sentence.english}</span>
                <div class="sentence-actions">
                    <button class="action-btn-circle btn-speak" title="ฟังเสียงอ่าน">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <path d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"/>
                        </svg>
                    </button>
                    <button class="action-btn-circle btn-save-sentence ${isAlreadySaved ? 'saved' : ''}" title="${isAlreadySaved ? 'บันทึกแล้ว' : 'บันทึกประโยคนี้'}">
                        <svg viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
                        </svg>
                    </button>
                </div>
            </div>
            <div class="sentence-details-drawer">
                <div class="translation-label">🇹🇭 ${sentence.thai}</div>
                <div class="vocab-tag-list">
                    ${sentence.vocabulary.map(v => `<span class="vocab-tag" title="${v.meaning}">🔑 <b>${v.word}</b> ${v.phonetic} - ${v.meaning}</span>`).join('')}
                </div>
                ${sentence.phrases && sentence.phrases.length > 0 ? `
                <div class="vocab-tag-list" style="margin-top: 0.4rem;">
                    ${sentence.phrases.map(p => `<span class="phrase-tag" title="${p.meaning}">💬 <b>${p.phrase}</b> - ${p.meaning}</span>`).join('')}
                </div>
                ` : ''}
            </div>
        `;
        
        // ผูก Event Listeners
        // 1. ปุ่มฟังเสียงอ่าน
        sentenceBlock.querySelector('.btn-speak').addEventListener('click', (e) => {
            e.stopPropagation();
            speakText(sentence.english);
        });
        
        // 2. ปุ่มเซฟประโยค
        const saveBtn = sentenceBlock.querySelector('.btn-save-sentence');
        saveBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSaveSentence(sentence, saveBtn);
        });
        
        container.appendChild(sentenceBlock);
    });
}

// เซฟหรือลบประโยคที่บันทึก
function toggleSaveSentence(sentenceObj, buttonEl) {
    const isSaved = buttonEl.classList.contains('saved');
    
    if (isSaved) {
        // ทำการลบ
        state.savedSentences = state.savedSentences.filter(s => s.english.trim().toLowerCase() !== sentenceObj.english.trim().toLowerCase());
        buttonEl.classList.remove('saved');
        buttonEl.title = 'บันทึกประโยคนี้';
        
        // ถ้าผูกเรื่องไว้ ให้รีเช็คเรื่องนั้นด้วย
        if (sentenceObj.storyId) {
            const story = state.savedStories.find(s => s.id === sentenceObj.storyId);
            if (story) {
                story.flashcardMastery = false;
                checkAndAwardStoryStars(story.id);
            }
        } else if (state.currentStory) {
            const story = state.savedStories.find(s => s.id === state.currentStory.id);
            if (story) {
                story.flashcardMastery = false;
                checkAndAwardStoryStars(story.id);
            }
        }
        
        showToast('ลบประโยคออกจากการบันทึกแล้ว', 'warning');
    } else {
        // ทำการบันทึก
        const newRecord = {
            id: `sentence_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            english: sentenceObj.english,
            thai: sentenceObj.thai,
            vocabulary: sentenceObj.vocabulary,
            phrases: sentenceObj.phrases || [],
            storyId: state.currentStory ? state.currentStory.id : (state.currentReader ? state.currentReader.id : null),
            storyTitle: state.currentStory ? state.currentStory.title : (state.currentReader ? state.currentReader.title : 'Custom Reader')
        };
        
        state.savedSentences.push(newRecord);
        buttonEl.classList.add('saved');
        buttonEl.title = 'บันทึกแล้ว';
        
        // เพิ่มคำศัพท์เข้า Word Bank อัตโนมัติ
        const vocabList = sentenceObj.vocabulary || [];
        vocabList.forEach(vocab => {
            const exists = state.vocabBank.some(v => v.word.toLowerCase() === vocab.word.toLowerCase());
            if (!exists) {
                state.vocabBank.push({
                    word: vocab.word,
                    phonetic: vocab.phonetic,
                    meaning: vocab.meaning,
                    example: sentenceObj.english
                });
            }
        });
        
        showToast('บันทึกประโยคและคำศัพท์เข้าคลังฝึกฝนแล้ว!');
    }
    
    saveDataToLocalStorage();
    updateStoryFilters();
}

// ระบบเสียงพูดจำลอง (Text-To-Speech)
async function speakText(text) {
    const workerUrl = "https://engbuddy-tts.natthapon-manat.workers.dev";
    
    try {
        const aiSpeakers = new Set(['angus', 'asteria', 'luna', 'stella', 'athena', 'hera', 'arcas', 'orion', 'orpheus', 'zeus', 'helios']);
        const speaker = state.audioVoice || "angus";
        
        // หากเลือกเสียงจำลองของเบราว์เซอร์ ให้โยน Error เพื่อใช้เบราว์เซอร์เล่นทันที
        if (!aiSpeakers.has(speaker)) {
            throw new Error("Local browser voice selected");
        }
        
        // ดึงไฟล์เสียงเสียงสังเคราะห์ AI จาก Cloudflare Worker พร้อมระบุผู้พูด (speaker)
        const response = await fetch(`${workerUrl}?text=${encodeURIComponent(text)}&speaker=${speaker}`);
        if (!response.ok) throw new Error("Cloudflare TTS failed");
        
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        
        // ปรับระดับความเร็วเสียงตามตั้งค่าของแอป
        audio.playbackRate = parseFloat(state.audioSpeed || 0.9); 
        audio.play();
    } catch (e) {
        console.warn("AI TTS failed or local voice selected, falling back to Browser Web Speech API:", e);
        
        // ระบบสำรอง (Fallback) หากคลาวด์ติดปัญหา ให้กลับไปใช้เสียงอ่านพื้นฐานของเบราว์เซอร์
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel(); // ยกเลิกค้างอันเก่า
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'en-US';
            utterance.rate = parseFloat(state.audioSpeed || 0.9);
            
            const voices = window.speechSynthesis.getVoices();
            if (state.audioVoice && !['angus', 'asteria', 'luna', 'stella', 'athena', 'hera', 'arcas', 'orion', 'orpheus', 'zeus', 'helios'].includes(state.audioVoice)) {
                const selectedVoice = voices.find(v => v.name === state.audioVoice);
                if (selectedVoice) {
                    utterance.voice = selectedVoice;
                }
            } else {
                const defaultVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) ||
                                     voices.find(v => v.lang.startsWith('en'));
                if (defaultVoice) {
                    utterance.voice = defaultVoice;
                }
            }
            window.speechSynthesis.speak(utterance);
        } else {
            console.error('Browser or device does not support Text-to-Speech');
        }
    }
}

// โหลดตัวเลือกเสียงภาษาอังกฤษฟรีจากตัวเบราว์เซอร์และคลาวด์
function loadSpeechVoices() {
    const voiceSelect = document.getElementById('settings-audio-voice');
    if (!voiceSelect) return;
    
    voiceSelect.innerHTML = '';
    
    // 1. เพิ่มตัวเลือกเสียงระดับพรีเมียมจาก Cloudflare AI
    const CLOUDFLARE_AI_VOICES = [
        { value: 'angus', label: '✨ AI Male: Angus (Irish - Default)' },
        { value: 'asteria', label: '✨ AI Female: Asteria (US - แนะนำ ⭐️)' },
        { value: 'luna', label: '✨ AI Female: Luna (US)' },
        { value: 'stella', label: '✨ AI Female: Stella (US)' },
        { value: 'athena', label: '✨ AI Female: Athena (UK)' },
        { value: 'hera', label: '✨ AI Female: Hera (US)' },
        { value: 'arcas', label: '✨ AI Male: Arcas (US)' },
        { value: 'orion', label: '✨ AI Male: Orion (US)' },
        { value: 'orpheus', label: '✨ AI Male: Orpheus (US)' },
        { value: 'zeus', label: '✨ AI Male: Zeus (US)' },
        { value: 'helios', label: '✨ AI Male: Helios (UK)' }
    ];
    
    CLOUDFLARE_AI_VOICES.forEach(item => {
        const option = document.createElement('option');
        option.value = item.value;
        option.textContent = item.label;
        voiceSelect.appendChild(option);
    });
    
    // 2. ดึงเสียงที่มีในบราวเซอร์เครื่องมาเสริม (สำหรับระบบสำรอง)
    if ('speechSynthesis' in window) {
        const voices = window.speechSynthesis.getVoices();
        const englishVoices = voices.filter(v => v.lang.startsWith('en'));
        
        if (englishVoices.length > 0) {
            // เพิ่มตัวแบ่งกลุ่ม
            const separator = document.createElement('option');
            separator.disabled = true;
            separator.textContent = '------------------ เสียงจำลองบนเบราว์เซอร์ ------------------';
            voiceSelect.appendChild(separator);
            
            englishVoices.forEach(voice => {
                const option = document.createElement('option');
                option.value = voice.name;
                option.textContent = `${voice.name} (${voice.lang})`;
                voiceSelect.appendChild(option);
            });
        }
    }
    
    // โหลดค่าเดิมที่เซฟไว้ (ถ้ามี) หรือใช้ค่าเริ่มต้นเป็น angus
    if (state.audioVoice) {
        voiceSelect.value = state.audioVoice;
    } else {
        state.audioVoice = 'angus';
        voiceSelect.value = 'angus';
    }
}

// ผูกฟังก์ชันการเปลี่ยนรายการเสียงเมื่อมีการเปลี่ยนแปลงในตัวเบราว์เซอร์ (โหลด async)
if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = loadSpeechVoices;
}

// บันทึกการตั้งค่าเสียง
function saveAudioSettings() {
    const voiceSelect = document.getElementById('settings-audio-voice');
    const speedInput = document.getElementById('settings-audio-speed');
    
    if (!voiceSelect || !speedInput) return;
    
    state.audioVoice = voiceSelect.value;
    state.audioSpeed = parseFloat(speedInput.value);
    
    localStorage.setItem('engbuddy_audio_voice', state.audioVoice);
    localStorage.setItem('engbuddy_audio_speed', state.audioSpeed);
    
    showToast('บันทึกการตั้งค่าเสียงพูดเรียบร้อยแล้ว!');
}

// ทดสอบความเร็วและโทนเสียง
function testAudioSettings() {
    const speedVal = document.getElementById('settings-audio-speed')?.value || 0.9;
    const voiceVal = document.getElementById('settings-audio-voice')?.value || '';
    
    // สำรองค่าความเร็วและประเภทเสียงเพื่อใช้ในการทดสอบชั่วคราว
    const oldSpeed = state.audioSpeed;
    const oldVoice = state.audioVoice;
    
    state.audioSpeed = parseFloat(speedVal);
    state.audioVoice = voiceVal;
    
    let voiceLabel = "Default System voice";
    if (voiceVal) {
        voiceLabel = voiceVal.split(' ')[0] || voiceVal;
    }
    
    const testMessage = `Hello, this is a test of ${voiceLabel} voice. Do you like it?`;
    
    speakText(testMessage).finally(() => {
        // คืนค่าเดิมหลังจากทดสอบ
        state.audioSpeed = oldSpeed;
        state.audioVoice = oldVoice;
    });
}

// ฟังก์ชันสลับการเซฟเรื่องเล่าสั้น
function toggleSaveStory() {
    if (!state.currentStory) return;
    const story = state.currentStory;
    const isSaved = state.savedStories.some(s => s.id === story.id);
    const saveStoryBtn = document.getElementById('btn-save-story');
    const saveStoryText = document.getElementById('btn-save-story-text');
    
    if (isSaved) {
        // ทำการลบ
        state.savedStories = state.savedStories.filter(s => s.id !== story.id);
        if (saveStoryBtn) saveStoryBtn.classList.remove('saved');
        if (saveStoryText) saveStoryText.textContent = 'บันทึกเรื่องนี้';
        
        // ลบประโยคทั้งหมดในเรื่องนี้ออกด้วย
        state.savedSentences = state.savedSentences.filter(s => s.storyId !== story.id);
        
        showToast('ลบเรื่องเล่าและประโยคของเรื่องนี้ออกจากการบันทึกแล้ว', 'warning');
    } else {
        // ทำการเซฟ โดยเริ่มตั้งสถานะการทบทวน (Gamification & Repetition state)
        story.readMastery = false;
        story.flashcardMastery = false;
        story.quizMastery = false;
        story.stars = 0;
        story.quizCorrectCount = 0;
        story.lastReviewedDate = Date.now();
        story.savedAt = Date.now();
        
        state.savedStories.push(story);
        if (saveStoryBtn) saveStoryBtn.classList.add('saved');
        if (saveStoryText) saveStoryText.textContent = 'บันทึกแล้ว';
        
        // เซฟประโยคทั้งหมดเข้า savedSentences ทันที
        story.story_sentences.forEach((sentence, index) => {
            const exists = state.savedSentences.some(s => s.english.trim().toLowerCase() === sentence.english.trim().toLowerCase());
            if (!exists) {
                state.savedSentences.push({
                    id: `sentence_${Date.now()}_${index}_${Math.floor(Math.random() * 1000)}`,
                    english: sentence.english,
                    thai: sentence.thai,
                    vocabulary: sentence.vocabulary,
                    phrases: sentence.phrases || [],
                    storyId: story.id,
                    storyTitle: story.title
                });
            } else {
                // อัปเดตผูกมัด storyId ถ้าประโยคเคยเซฟแต่ยังไม่ได้ผูกเรื่อง
                const existingS = state.savedSentences.find(s => s.english.trim().toLowerCase() === sentence.english.trim().toLowerCase());
                if (existingS) {
                    if (!existingS.storyId) {
                        existingS.storyId = story.id;
                        existingS.storyTitle = story.title;
                    }
                    if (!existingS.phrases && sentence.phrases) {
                        existingS.phrases = sentence.phrases;
                    }
                }
            }
            
            // เพิ่มคำศัพท์เข้า Word Bank
            const vocabList = sentence.vocabulary || [];
            vocabList.forEach(vocab => {
                const vExists = state.vocabBank.some(v => v.word.toLowerCase() === vocab.word.toLowerCase());
                if (!vExists) {
                    state.vocabBank.push({
                        word: vocab.word,
                        phonetic: vocab.phonetic,
                        meaning: vocab.meaning,
                        example: sentence.english
                    });
                }
            });
        });
        
        showToast('บันทึกเรื่องเล่า ประโยคสะสม และศัพท์ลงระบบสำเร็จ!');
    }
    
    saveDataToLocalStorage();
    renderSavedStoriesList();
    renderSavedReadersList();
    updateStoryFilters();
    updateFlashcardStats();
    
    // อัปเดตปุ่มแต่ละประโยคในหน้านั้น
    renderStory(story);
}

// เรนเดอร์รายชื่อเรื่องเล่าที่เซฟไว้ที่ Sidebar ซ้ายของแท็บเรื่องราว
// เรนเดอร์รายชื่อเรื่องเล่าที่เซฟไว้ที่ Sidebar ซ้ายของแท็บเรื่องราว
function renderSavedStoriesList() {
    const container = document.getElementById('saved-stories-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    const storiesOnly = state.savedStories.filter(s => !s.isCustomReader);
    
    if (storiesOnly.length === 0) {
        container.innerHTML = `<div class="empty-list-text" id="saved-stories-empty" style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 1rem 0;">ยังไม่มีเรื่องเล่าถูกบันทึก</div>`;
        return;
    }
    
    storiesOnly.forEach(story => {
        // คำนวณพลังความจำเสื่อมถอย 20% ต่อวัน (24 ชม.)
        const lastReviewed = story.lastReviewedDate || story.savedAt || Date.now();
        const daysElapsed = (Date.now() - lastReviewed) / (1000 * 60 * 60 * 24);
        const memoryGauge = Math.max(0, Math.min(100, 100 - Math.floor(daysElapsed * 20)));
        
        // เลือกสีเกจตามเปอร์เซ็นต์ความจำ
        let gaugeColor = 'var(--color-success)'; // สีเขียวเมื่อ >= 60%
        if (memoryGauge < 30) {
            gaugeColor = 'var(--color-accent)'; // สีแดงเมื่อ < 30% (ใกล้ลืมมาก)
        } else if (memoryGauge < 60) {
            gaugeColor = 'var(--color-warning)'; // สีส้ม/เหลืองเมื่อลดถอยลง
        }
        
        // แปลงจำนวนดาว
        let starsHtml = '';
        const starsCount = story.stars || 0;
        for (let i = 1; i <= 3; i++) {
            if (i <= starsCount) {
                starsHtml += '<span style="color: #ffd700; font-size: 0.8rem;">★</span>';
            } else {
                starsHtml += '<span style="color: rgba(255, 255, 255, 0.15); font-size: 0.8rem;">★</span>';
            }
        }
        
        const item = document.createElement('div');
        item.className = 'saved-story-item';
        item.innerHTML = `
            <div class="saved-story-info" style="flex-grow: 1; overflow: hidden; display: flex; flex-direction: column; gap: 0.2rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.4rem;">
                    <span class="saved-story-title-text" title="${story.title}" style="font-weight: 600; font-size: 0.85rem; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 140px;">${story.title}</span>
                    <div style="display: flex; align-items: center; gap: 1px;">${starsHtml}</div>
                </div>
                <span class="saved-story-meta-text" style="font-size: 0.7rem; color: var(--text-muted); display: block;">ระดับ ${story.level || 'Beginner'} • Memory: ${memoryGauge}%</span>
                <!-- Memory Gauge Bar -->
                <div class="memory-gauge-container" style="width: 100%; height: 4px; background: rgba(255, 255, 255, 0.08); border-radius: 2px; overflow: hidden; position: relative; margin-top: 1px;">
                    <div class="memory-gauge" style="width: ${memoryGauge}%; height: 100%; background: ${gaugeColor}; transition: width 0.4s ease;"></div>
                </div>
            </div>
            <button class="btn-delete-story" title="ลบเรื่องนี้" style="background: none; border: none; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 4px; margin-left: 6px;">
                <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.5;">
                    <path d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        `;
        
        // กดที่ข้อมูลเพื่อโหลดเนื้อหาเรื่อง
        item.querySelector('.saved-story-info').addEventListener('click', () => {
            state.currentStory = story;
            renderStory(story);
        });
        
        // กดลบ
        item.querySelector('.btn-delete-story').addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`คุณต้องการลบเรื่องเล่า "${story.title}" และประโยคของเรื่องนี้ใช่หรือไม่?`)) {
                state.savedStories = state.savedStories.filter(s => s.id !== story.id);
                state.savedSentences = state.savedSentences.filter(s => s.storyId !== story.id);
                
                if (state.currentStory && state.currentStory.id === story.id) {
                    const saveStoryBtn = document.getElementById('btn-save-story');
                    const saveStoryText = document.getElementById('btn-save-story-text');
                    if (saveStoryBtn) saveStoryBtn.classList.remove('saved');
                    if (saveStoryText) saveStoryText.textContent = 'บันทึกเรื่องนี้';
                }
                
                saveDataToLocalStorage();
                renderSavedStoriesList();
                renderSavedReadersList();
                updateStoryFilters();
                updateFlashcardStats();
                showToast(`ลบเรื่องเล่าเรียบร้อยแล้ว`, 'warning');
            }
        });
        
        container.appendChild(item);
    });
}

// เรนเดอร์รายชื่อข้อความฝึกฝนตัวเองที่เซฟไว้ที่ Sidebar ซ้ายของแท็บ Reader
function renderSavedReadersList() {
    const container = document.getElementById('saved-readers-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    const readersOnly = state.savedStories.filter(s => s.isCustomReader);
    
    if (readersOnly.length === 0) {
        container.innerHTML = `<div class="empty-list-text" id="saved-readers-empty" style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 1rem 0;">ยังไม่มีข้อความถูกบันทึก</div>`;
        return;
    }
    
    readersOnly.forEach(reader => {
        // คำนวณพลังความจำเสื่อมถอย 20% ต่อวัน (24 ชม.)
        const lastReviewed = reader.lastReviewedDate || reader.savedAt || Date.now();
        const daysElapsed = (Date.now() - lastReviewed) / (1000 * 60 * 60 * 24);
        const memoryGauge = Math.max(0, Math.min(100, 100 - Math.floor(daysElapsed * 20)));
        
        let gaugeColor = 'var(--color-success)';
        if (memoryGauge < 30) {
            gaugeColor = 'var(--color-accent)';
        } else if (memoryGauge < 60) {
            gaugeColor = 'var(--color-warning)';
        }
        
        let starsHtml = '';
        const starsCount = reader.stars || 0;
        for (let i = 1; i <= 3; i++) {
            if (i <= starsCount) {
                starsHtml += '<span style="color: #ffd700; font-size: 0.8rem;">★</span>';
            } else {
                starsHtml += '<span style="color: rgba(255, 255, 255, 0.15); font-size: 0.8rem;">★</span>';
            }
        }
        
        const item = document.createElement('div');
        item.className = 'saved-story-item';
        item.innerHTML = `
            <div class="saved-story-info" style="flex-grow: 1; overflow: hidden; display: flex; flex-direction: column; gap: 0.2rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.4rem;">
                    <span class="saved-story-title-text" title="${reader.title}" style="font-weight: 600; font-size: 0.85rem; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 140px;">${reader.title}</span>
                    <div style="display: flex; align-items: center; gap: 1px;">${starsHtml}</div>
                </div>
                <span class="saved-story-meta-text" style="font-size: 0.7rem; color: var(--text-muted); display: block;">ระดับ ${reader.level || 'Beginner'} • Memory: ${memoryGauge}%</span>
                <div class="memory-gauge-container" style="width: 100%; height: 4px; background: rgba(255, 255, 255, 0.08); border-radius: 2px; overflow: hidden; position: relative; margin-top: 1px;">
                    <div class="memory-gauge" style="width: ${memoryGauge}%; height: 100%; background: ${gaugeColor}; transition: width 0.4s ease;"></div>
                </div>
            </div>
            <button class="btn-delete-reader" title="ลบข้อความนี้" style="background: none; border: none; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 4px; margin-left: 6px;">
                <svg viewBox="0 0 24 24" style="width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.5;">
                    <path d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        `;
        
        // กดที่ข้อมูลเพื่อโหลดเนื้อหา
        item.querySelector('.saved-story-info').addEventListener('click', () => {
            state.currentReader = reader;
            state.readerReadCompleted = reader.readMastery || false;
            localStorage.setItem('engbuddy_current_reader', JSON.stringify(state.currentReader));
            localStorage.setItem('engbuddy_reader_read_completed', state.readerReadCompleted);
            renderReader(reader);
            
            const titleInput = document.getElementById('reader-title-input');
            const textInput = document.getElementById('reader-text-input');
            if (titleInput) titleInput.value = reader.title || '';
            if (textInput) {
                if (reader.originalText) {
                    textInput.value = reader.originalText;
                } else if (reader.story_sentences) {
                    textInput.value = reader.story_sentences.map(s => s.english).join('\n');
                }
            }
        });
        
        // กดลบ
        item.querySelector('.btn-delete-reader').addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`คุณต้องการลบข้อความ "${reader.title}" และประโยคของข้อความนี้ใช่หรือไม่?`)) {
                state.savedStories = state.savedStories.filter(s => s.id !== reader.id);
                state.savedSentences = state.savedSentences.filter(s => s.storyId !== reader.id);
                
                if (state.currentReader && state.currentReader.id === reader.id) {
                    state.currentReader = null;
                    state.readerReadCompleted = false;
                    localStorage.removeItem('engbuddy_current_reader');
                    localStorage.setItem('engbuddy_reader_read_completed', 'false');
                    
                    const displaySec = document.getElementById('reader-display');
                    const placeholder = document.getElementById('reader-placeholder');
                    if (displaySec) displaySec.style.display = 'none';
                    if (placeholder) placeholder.style.display = 'block';
                }
                
                saveDataToLocalStorage();
                renderSavedReadersList();
                updateStoryFilters();
                updateFlashcardStats();
                showToast(`ลบข้อความเรียบร้อยแล้ว`, 'warning');
            }
        });
        
        container.appendChild(item);
    });
}

// ==========================================================================
// 5.5 CUSTOM READER MODULE (ระบบวิเคราะห์ข้อความและฝึกอ่านของตัวเอง)
// ==========================================================================
async function analyzeCustomText() {
    const titleInput = document.getElementById('reader-title-input').value.trim();
    const textInput = document.getElementById('reader-text-input').value.trim();
    
    if (!textInput) {
        showToast('กรุณากรอกหรือวางข้อความภาษาอังกฤษก่อนวิเคราะห์นะครับ', 'warning');
        return;
    }
    
    // แสดง loading
    const loading = document.getElementById('reader-loading');
    const loadingText = document.getElementById('reader-loading-text');
    if (loadingText) {
        loadingText.textContent = 'Gemini กำลังแปลภาษาและสแกนโครงสร้างไวยากรณ์ให้คุณ...';
    }
    if (loading) {
        loading.classList.add('active');
    }
    
    // ตั้งชื่อเรื่องถ้าว่างอยู่
    const title = titleInput || 'ข้อความฝึกฝนของฉัน';
    
    const prompt = `You are a professional, helpful English tutor. Analyze this English text:
"${textInput}"

Break down the text into individual sentences (maximum 10 sentences. If the text is very long, summarize or truncate it so that it yields at most 10 sentences for readability).
For each sentence, perform the following tasks:
1. "english": Provide the English sentence itself.
2. "thai": Provide a natural, context-aware Thai translation that fits the context of the whole text.
3. "vocabulary": List 1 to 2 key vocabulary words from that sentence. For each, include:
   - "word": The word.
   - "phonetic": The IPA phonetic notation (e.g., "/krɪsp/").
   - "meaning": The Thai meaning.
4. "phrases": List 0 to 2 key phrases, idioms, or collocations from that sentence (if any). For each, include:
   - "phrase": The phrase.
   - "meaning": The Thai meaning.

You must reply with ONLY a JSON object that strictly adheres to the following format. Do not include markdown codeblocks (like \`\`\`json) or any preamble/postamble.
JSON format:
{
  "title": "${title}",
  "story_sentences": [
    {
      "english": "Sentence text...",
      "thai": "แปลไทย...",
      "vocabulary": [
        { "word": "word", "phonetic": "/ipa/", "meaning": "แปลไทย" }
      ],
      "phrases": [
        { "phrase": "phrase", "meaning": "แปลไทย" }
      ]
    }
  ]
}`;

    const rawResponse = await callGeminiAPI(prompt, "You are a professional English teacher for Thai students.", true);
    if (loading) {
        loading.classList.remove('active');
    }
    
    if (!rawResponse) return;
    
    try {
        let cleanText = rawResponse.trim();
        if (cleanText.startsWith('```json')) {
            cleanText = cleanText.substring(7);
        }
        if (cleanText.endsWith('```')) {
            cleanText = cleanText.substring(0, cleanText.length - 3);
        }
        cleanText = cleanText.trim();
        
        const readerData = JSON.parse(cleanText);
        readerData.id = 'reader_' + Date.now();
        state.currentReader = readerData;
        state.readerReadCompleted = false;
        
        renderReader(readerData);
    } catch (e) {
        console.error('Error parsing JSON custom reader:', e, rawResponse);
        showToast('ไม่สามารถวิเคราะห์โครงสร้างภาษาได้ กรุณาลองวิเคราะห์ใหม่อีกครั้งครับ', 'error');
    }
}

function renderReader(readerData) {
    const placeholder = document.getElementById('reader-placeholder');
    const displaySec = document.getElementById('reader-display');
    const titleEl = document.getElementById('display-reader-title');
    
    if (placeholder) placeholder.style.display = 'none';
    if (displaySec) displaySec.style.display = 'block';
    if (titleEl) titleEl.textContent = readerData.title;
    
    // แสดงผลดาวระดับความชำนาญ
    const starsContainer = document.getElementById('display-reader-stars');
    if (starsContainer) {
        starsContainer.innerHTML = '';
        const savedReader = state.savedStories.find(s => s.id === readerData.id);
        const starsCount = savedReader ? (savedReader.stars || 0) : 0;
        for (let i = 1; i <= 3; i++) {
            if (i <= starsCount) {
                starsContainer.innerHTML += '<span style="color: #ffd700; font-size: 1.1rem; text-shadow: 0 0 5px rgba(255,215,0,0.5);">★</span>';
            } else {
                starsContainer.innerHTML += '<span style="color: rgba(255,255,255,0.15); font-size: 1.1rem;">★</span>';
            }
        }
        if (starsCount === 3) {
            starsContainer.innerHTML += ' <span style="font-size: 0.75rem; color: #ffd700; font-weight: bold; text-shadow: 0 0 5px rgba(255,215,0,0.5);">Mastered 👑</span>';
        }
    }
    
    // อัปเดตสถานะปุ่มบันทึกข้อความนี้
    const saveReaderBtn = document.getElementById('btn-save-reader');
    const saveReaderText = document.getElementById('btn-save-reader-text');
    if (saveReaderBtn && saveReaderText) {
        const isReaderSaved = state.savedStories.some(s => s.id === readerData.id);
        if (isReaderSaved) {
            saveReaderBtn.classList.add('saved');
            saveReaderText.textContent = 'บันทึกแล้ว';
        } else {
            saveReaderBtn.classList.remove('saved');
            saveReaderText.textContent = 'บันทึกข้อความนี้';
        }
    }
    
    // อัปเดตสถานะปุ่มบันทึกทั้งหมด
    const saveAllBtn = document.getElementById('btn-reader-save-all');
    if (saveAllBtn && readerData.story_sentences) {
        const allSaved = readerData.story_sentences.every(sentence => 
            state.savedSentences.some(s => s.english.trim().toLowerCase() === sentence.english.trim().toLowerCase())
        );
        const btnTextSpan = saveAllBtn.querySelector('span');
        if (allSaved) {
            saveAllBtn.classList.add('saved');
            if (btnTextSpan) btnTextSpan.textContent = 'บันทึกทุกประโยคแล้ว';
            saveAllBtn.title = 'ทุกประโยคในหน้านี้ถูกบันทึกเรียบร้อยแล้ว';
        } else {
            saveAllBtn.classList.remove('saved');
            if (btnTextSpan) btnTextSpan.textContent = 'บันทึกทุกประโยค (Save All)';
            saveAllBtn.title = 'บันทึกทุกประโยคในหน้านี้เข้าคลัง';
        }
    }
    
    // แสดงปุ่มทบทวนบทเรียน
    const reviewContainer = document.getElementById('reader-review-action-container');
    const reviewText = document.getElementById('btn-reader-mark-read-text');
    const savedReader = state.savedStories.find(s => s.id === readerData.id);
    
    if (reviewContainer && reviewText) {
        reviewContainer.style.display = 'flex';
        const btn = reviewContainer.querySelector('button');
        if (btn) {
            if (savedReader && savedReader.readMastery) {
                btn.style.background = 'rgba(255,255,255,0.05)';
                btn.style.borderColor = 'var(--glass-border)';
                btn.style.boxShadow = 'none';
                btn.disabled = true;
                reviewText.textContent = '🔊 ทบทวนและออกเสียงข้อความนี้ครบถ้วนแล้ว';
            } else {
                btn.style.background = 'var(--gradient-success)';
                btn.style.boxShadow = '0 4px 15px rgba(0, 184, 255, 0.3)';
                btn.disabled = false;
                reviewText.textContent = '🔊 ฝึกทบทวนและออกเสียงครบถ้วนแล้ว (+10 XP)';
            }
        }
    }
    
    const container = document.getElementById('reader-sentences-container');
    if (container) {
        container.innerHTML = '';
        
        readerData.story_sentences.forEach((sentence, index) => {
            const isAlreadySaved = state.savedSentences.some(s => s.english.trim().toLowerCase() === sentence.english.trim().toLowerCase());
            
            const sentenceBlock = document.createElement('div');
            sentenceBlock.className = 'sentence-block';
            sentenceBlock.innerHTML = `
                <div class="sentence-top-row">
                    <span class="sentence-text">${sentence.english}</span>
                    <div class="sentence-actions">
                        <button class="action-btn-circle btn-speak" title="ฟังเสียงอ่าน">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                <path d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"/>
                            </svg>
                        </button>
                        <button class="action-btn-circle btn-save-sentence ${isAlreadySaved ? 'saved' : ''}" title="${isAlreadySaved ? 'บันทึกแล้ว' : 'บันทึกประโยคนี้'}">
                            <svg viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="sentence-details-drawer">
                    <div class="translation-label">🇹🇭 ${sentence.thai}</div>
                    <div class="vocab-tag-list">
                        ${sentence.vocabulary.map(v => `<span class="vocab-tag" title="${v.meaning}">🔑 <b>${v.word}</b> ${v.phonetic} - ${v.meaning}</span>`).join('')}
                    </div>
                    ${sentence.phrases && sentence.phrases.length > 0 ? `
                    <div class="vocab-tag-list" style="margin-top: 0.4rem;">
                        ${sentence.phrases.map(p => `<span class="phrase-tag" title="${p.meaning}">💬 <b>${p.phrase}</b> - ${p.meaning}</span>`).join('')}
                    </div>
                    ` : ''}
                </div>
            `;
            
            // 1. ปุ่มฟังเสียงอ่าน
            sentenceBlock.querySelector('.btn-speak').addEventListener('click', (e) => {
                e.stopPropagation();
                speakText(sentence.english);
            });
            
            // 2. ปุ่มเซฟประโยค
            const saveBtn = sentenceBlock.querySelector('.btn-save-sentence');
            if (saveBtn) {
                saveBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleSaveSentence(sentence, saveBtn);
                });
            }
            
            container.appendChild(sentenceBlock);
        });
    }
}

function markReaderAsRead() {
    if (state.readerReadCompleted) {
        showToast("คุณทบทวนและสะสมคะแนนจากบทนี้ไปแล้วครับ", "warning");
        return;
    }
    state.readerReadCompleted = true;
    
    // ให้ XP
    addXP(10, `ทบทวนและเรียนรู้ประโยคของตัวเองสำเร็จ`);
    
    // ปิดปุ่ม
    const markReadBtn = document.getElementById('btn-reader-mark-read');
    if (markReadBtn) {
        markReadBtn.style.background = 'rgba(255,255,255,0.05)';
        markReadBtn.style.borderColor = 'var(--glass-border)';
        markReadBtn.style.boxShadow = 'none';
        markReadBtn.disabled = true;
        const btnText = document.getElementById('btn-reader-mark-read-text');
        if (btnText) btnText.textContent = '🔊 ทบทวนและฝึกฝนข้อความนี้ครบถ้วนแล้ว';
    }
    
    if (state.currentReader) {
        const savedReader = state.savedStories.find(s => s.id === state.currentReader.id);
        if (savedReader) {
            savedReader.readMastery = true;
            savedReader.lastReviewedDate = Date.now();
            checkAndAwardStoryStars(savedReader.id);
        }
    }
}

// ฟังก์ชันสลับการเซฟบทความฝึกฝนของตัวเอง
function toggleSaveReader() {
    if (!state.currentReader) return;
    const reader = state.currentReader;
    const isSaved = state.savedStories.some(s => s.id === reader.id);
    const saveReaderBtn = document.getElementById('btn-save-reader');
    const saveReaderText = document.getElementById('btn-save-reader-text');
    
    if (isSaved) {
        // ทำการลบ
        state.savedStories = state.savedStories.filter(s => s.id !== reader.id);
        if (saveReaderBtn) saveReaderBtn.classList.remove('saved');
        if (saveReaderText) saveReaderText.textContent = 'บันทึกข้อความนี้';
        
        // ลบประโยคทั้งหมดในเรื่องนี้ออกด้วย
        state.savedSentences = state.savedSentences.filter(s => s.storyId !== reader.id);
        
        showToast('ลบข้อความและประโยคของข้อความนี้ออกจากการบันทึกแล้ว', 'warning');
    } else {
        // ทำการเซฟ โดยเริ่มตั้งสถานะการทบทวน (Gamification & Repetition state)
        reader.isCustomReader = true;
        reader.readMastery = false;
        reader.flashcardMastery = false;
        reader.quizMastery = false;
        reader.stars = 0;
        reader.quizCorrectCount = 0;
        reader.lastReviewedDate = Date.now();
        reader.savedAt = Date.now();
        
        const textInput = document.getElementById('reader-text-input');
        if (textInput) {
            reader.originalText = textInput.value;
        }
        
        state.savedStories.push(reader);
        if (saveReaderBtn) saveReaderBtn.classList.add('saved');
        if (saveReaderText) saveReaderText.textContent = 'บันทึกแล้ว';
        
        // เซฟประโยคทั้งหมดเข้า savedSentences ทันที
        let newlySavedCount = 0;
        reader.story_sentences.forEach((sentence, index) => {
            const exists = state.savedSentences.some(s => s.english.trim().toLowerCase() === sentence.english.trim().toLowerCase());
            if (!exists) {
                state.savedSentences.push({
                    id: `sentence_${Date.now()}_${index}_${Math.floor(Math.random() * 1000)}`,
                    english: sentence.english,
                    thai: sentence.thai,
                    vocabulary: sentence.vocabulary,
                    phrases: sentence.phrases || [],
                    storyId: reader.id,
                    storyTitle: reader.title
                });
                newlySavedCount++;
            } else {
                // อัปเดตผูกมัด storyId ถ้าประโยคเคยเซฟแต่ยังไม่ได้ผูกเรื่อง
                const existingS = state.savedSentences.find(s => s.english.trim().toLowerCase() === sentence.english.trim().toLowerCase());
                if (existingS) {
                    if (!existingS.storyId) {
                        existingS.storyId = reader.id;
                        existingS.storyTitle = reader.title;
                    }
                    if (!existingS.phrases && sentence.phrases) {
                        existingS.phrases = sentence.phrases;
                    }
                }
            }
            
            // เพิ่มคำศัพท์เข้า Word Bank
            const vocabList = sentence.vocabulary || [];
            vocabList.forEach(vocab => {
                const vExists = state.vocabBank.some(v => v.word.toLowerCase() === vocab.word.toLowerCase());
                if (!vExists) {
                    state.vocabBank.push({
                        word: vocab.word,
                        phonetic: vocab.phonetic,
                        meaning: vocab.meaning,
                        example: sentence.english
                    });
                }
            });
        });
        
        showToast('บันทึกข้อความ ประโยคสะสม และศัพท์ลงระบบสำเร็จ!');
    }
    
    saveDataToLocalStorage();
    renderSavedReadersList();
    updateStoryFilters();
    updateFlashcardStats();
    
    // อัปเดตการแสดงผลของเรื่อง
    renderReader(reader);
}

function saveAllReaderSentences() {
    if (!state.currentReader || !state.currentReader.story_sentences) {
        showToast("ไม่พบประโยคสำหรับบันทึก", "warning");
        return;
    }
    
    // Automatically save the reader article if it is not saved yet
    const isReaderSaved = state.savedStories.some(s => s.id === state.currentReader.id);
    if (!isReaderSaved) {
        const reader = state.currentReader;
        reader.isCustomReader = true;
        reader.readMastery = false;
        reader.flashcardMastery = false;
        reader.quizMastery = false;
        reader.stars = 0;
        reader.quizCorrectCount = 0;
        reader.lastReviewedDate = Date.now();
        reader.savedAt = Date.now();
        
        const textInput = document.getElementById('reader-text-input');
        if (textInput) {
            reader.originalText = textInput.value;
        }
        
        state.savedStories.push(reader);
        
        // Update button UI
        const saveReaderBtn = document.getElementById('btn-save-reader');
        const saveReaderText = document.getElementById('btn-save-reader-text');
        if (saveReaderBtn) saveReaderBtn.classList.add('saved');
        if (saveReaderText) saveReaderText.textContent = 'บันทึกแล้ว';
    }
    
    let newlySavedCount = 0;
    
    state.currentReader.story_sentences.forEach(sentence => {
        const isAlreadySaved = state.savedSentences.some(s => s.english.trim().toLowerCase() === sentence.english.trim().toLowerCase());
        
        if (!isAlreadySaved) {
            const newRecord = {
                id: `sentence_${Date.now()}_${Math.floor(Math.random() * 1000)}_${newlySavedCount}`,
                english: sentence.english,
                thai: sentence.thai,
                vocabulary: sentence.vocabulary,
                phrases: sentence.phrases || [],
                storyId: state.currentReader.id,
                storyTitle: state.currentReader.title
            };
            
            state.savedSentences.push(newRecord);
            newlySavedCount++;
            
            const vocabList = sentence.vocabulary || [];
            vocabList.forEach(vocab => {
                const exists = state.vocabBank.some(v => v.word.toLowerCase() === vocab.word.toLowerCase());
                if (!exists) {
                    state.vocabBank.push({
                        word: vocab.word,
                        phonetic: vocab.phonetic,
                        meaning: vocab.meaning,
                        example: sentence.english
                    });
                }
            });
        }
    });
    
    saveDataToLocalStorage();
    renderSavedReadersList();
    updateStoryFilters();
    updateFlashcardStats();
    
    renderReader(state.currentReader);
    
    if (newlySavedCount > 0) {
        showToast(`บันทึกประโยคใหม่ ${newlySavedCount} ประโยคพร้อมบทความเข้าคลังเรียบร้อยแล้ว! 🎉`);
    } else {
        showToast("บันทึกบทความนี้เข้าคลังเรียบร้อยแล้วครับ", "success");
    }
}

// อัปเดตตัวกรองเรื่องเล่าในหน้า Flashcard และ Quiz
function updateStoryFilters() {
    const flashcardFilter = document.getElementById('flashcard-story-filter');
    const quizFilter = document.getElementById('quiz-story-filter');
    
    if (!flashcardFilter || !quizFilter) return;
    
    const selectedFlashcardVal = flashcardFilter.value;
    const selectedQuizVal = quizFilter.value;
    
    flashcardFilter.innerHTML = '<option value="all">ทุกประโยคสะสม (All Sentences)</option>';
    quizFilter.innerHTML = '<option value="all">ทุกประโยคสะสม (All Sentences)</option>';
    
    // 1. ใส่เรื่องเล่าสั้นที่เซฟไว้
    state.savedStories.forEach(story => {
        const lastReviewed = story.lastReviewedDate || story.savedAt || Date.now();
        const daysElapsed = (Date.now() - lastReviewed) / (1000 * 60 * 60 * 24);
        const memoryGauge = Math.max(0, Math.min(100, 100 - Math.floor(daysElapsed * 20)));
        const starsText = '★'.repeat(story.stars || 0) + '☆'.repeat(3 - (story.stars || 0));
        const levelText = story.level || (story.isCustomReader ? 'Custom' : 'Beginner');
        
        const opt1 = document.createElement('option');
        opt1.value = story.id;
        opt1.textContent = `${story.title} (${levelText}) [${starsText} • Memory: ${memoryGauge}%]`;
        flashcardFilter.appendChild(opt1);
        
        const opt2 = document.createElement('option');
        opt2.value = story.id;
        opt2.textContent = `${story.title} (${levelText}) [${starsText} • Memory: ${memoryGauge}%]`;
        quizFilter.appendChild(opt2);
    });
    
    // 2. ค้นหาบทความ/ข้อความฝึกฝนส่วนตัว (Custom Reader) ที่เคยบันทึกประโยคไว้
    const processedStoryIds = new Set(state.savedStories.map(s => s.id));
    const customReadersList = [];
    
    state.savedSentences.forEach(s => {
        if (s.storyId && !processedStoryIds.has(s.storyId)) {
            processedStoryIds.add(s.storyId);
            customReadersList.push({
                id: s.storyId,
                title: s.storyTitle || 'ข้อความภายนอก'
            });
        }
    });
    
    customReadersList.forEach(reader => {
        const opt1 = document.createElement('option');
        opt1.value = reader.id;
        opt1.textContent = `📝 [จากข้อความ] ${reader.title}`;
        flashcardFilter.appendChild(opt1);
        
        const opt2 = document.createElement('option');
        opt2.value = reader.id;
        opt2.textContent = `📝 [จากข้อความ] ${reader.title}`;
        quizFilter.appendChild(opt2);
    });
    
    // คืนค่าที่เคยเลือก
    const isValidFlashcardVal = state.savedStories.some(s => s.id === selectedFlashcardVal) || 
                               state.savedSentences.some(s => s.storyId === selectedFlashcardVal);
    if (isValidFlashcardVal) {
        flashcardFilter.value = selectedFlashcardVal;
    } else {
        flashcardFilter.value = 'all';
    }
    
    const isValidQuizVal = state.savedStories.some(s => s.id === selectedQuizVal) || 
                           state.savedSentences.some(s => s.storyId === selectedQuizVal);
    if (isValidQuizVal) {
        quizFilter.value = selectedQuizVal;
    } else {
        quizFilter.value = 'all';
    }
    
    // แสดง/ซ่อนปุ่มลบกลุ่มฟิลเตอร์
    const btnDeleteGroup = document.getElementById('btn-delete-filter-group');
    if (btnDeleteGroup) {
        if (flashcardFilter.value === 'all') {
            btnDeleteGroup.style.display = 'none';
        } else {
            btnDeleteGroup.style.display = 'flex';
        }
    }
}

function deleteFilterGroup() {
    const filterVal = document.getElementById('flashcard-story-filter').value;
    if (filterVal === 'all') return;
    
    const sentencesInGroup = state.savedSentences.filter(s => s.storyId === filterVal);
    if (sentencesInGroup.length === 0) return;
    
    const groupTitle = sentencesInGroup[0].storyTitle || 'กลุ่มนี้';
    
    if (confirm(`คุณต้องการลบทั้ง ${sentencesInGroup.length} ประโยคในกลุ่ม "${groupTitle}" ออกจากคลังใช่หรือไม่?`)) {
        // ลบประโยคย่อยทั้งหมด
        state.savedSentences = state.savedSentences.filter(s => s.storyId !== filterVal);
        
        // ลบตัวบทความหรือเรื่องสั้นด้วย (ถ้ามีอยู่ใน savedStories)
        state.savedStories = state.savedStories.filter(s => s.id !== filterVal);
        
        saveDataToLocalStorage();
        renderSavedStoriesList();
        renderSavedReadersList();
        updateStoryFilters();
        updateFlashcardStats();
        initFlashcards();
        
        showToast(`ลบกลุ่มประโยคเรียบร้อยแล้ว`, 'warning');
    }
}

// ดึงประโยคที่คัดกรองแล้วสำหรับ Flashcard
function getFilteredSentences() {
    const filterVal = document.getElementById('flashcard-story-filter')?.value || 'all';
    if (filterVal === 'all') {
        return state.savedSentences;
    }
    return state.savedSentences.filter(s => s.storyId === filterVal);
}

// ดึงประโยคที่คัดกรองแล้วสำหรับ Quiz
function getFilteredQuizSentences() {
    const filterVal = document.getElementById('quiz-story-filter')?.value || 'all';
    if (filterVal === 'all') {
        return state.savedSentences;
    }
    return state.savedSentences.filter(s => s.storyId === filterVal);
}

// ==========================================================================
// 6. FLASHCARDS MODULE (ระบบการ์ดสลับข้างช่วยจำ)
// ==========================================================================
function updateFlashcardStats() {
    const sentences = getFilteredSentences();
    document.getElementById('stats-total-cards').textContent = sentences.length;
    
    const learnedCount = sentences.filter(s => state.learnedSentences.includes(s.id)).length;
    document.getElementById('stats-learned-cards').textContent = learnedCount;
    
    const needsReview = sentences.length - learnedCount;
    document.getElementById('stats-review-cards').textContent = needsReview >= 0 ? needsReview : 0;
}

function initFlashcards() {
    state.isCardFlipped = false;
    document.getElementById('flashcard-inner').classList.remove('is-flipped');
    
    const sentences = getFilteredSentences();
    
    if (sentences.length === 0) {
        // กรณีไม่มีข้อมูลเซฟไว้เลย
        document.getElementById('card-front-text').innerHTML = `คุณยังไม่มีประโยคสะสมในเรื่องนี้ครับ <br><span style="font-size: 1rem; font-weight: normal; color: var(--text-muted);">เลือกเรื่องอื่น หรือไปอ่านเรื่องราวใหม่ในแท็บ "เรื่องเล่าสั้น" นะครับ</span>`;
        document.getElementById('card-back-text').textContent = 'ไม่มีคำแปล';
        document.getElementById('card-back-vocab').innerHTML = '';
        
        document.getElementById('btn-card-prev').disabled = true;
        document.getElementById('btn-card-next').disabled = true;
        document.getElementById('btn-card-learned').disabled = true;
        document.getElementById('btn-card-remove').disabled = true;
        return;
    }
    
    // ตั้งค่ากลับไปที่การ์ดใบแรก
    if (state.currentCardIndex >= sentences.length) {
        state.currentCardIndex = 0;
    }
    
    showCard(state.currentCardIndex);
}

function showCard(index) {
    const sentences = getFilteredSentences();
    const sentence = sentences[index];
    if (!sentence) return;
    
    // แสดงประโยคภาษาไทยที่ด้านหน้า (ให้ผู้เรียนได้คิดและแปลเป็นภาษาอังกฤษในหัว)
    document.getElementById('card-front-text').textContent = `🇹🇭 ${sentence.thai}`;
    
    // แสดงประโยคภาษาอังกฤษเฉลยที่ด้านหลัง
    document.getElementById('card-back-text').textContent = sentence.english;
    
    // แสดงคำศัพท์เด่นและกลุ่มคำ/วลีใต้คำแปล
    let vocabHtml = sentence.vocabulary.map(v => `
        <span class="vocab-tag" style="background: rgba(138, 43, 226, 0.15); border-color: var(--color-primary); color: #fff; margin: 0.2rem; display: inline-block;">
            🔑 <b>${v.word}</b> ${v.phonetic} - ${v.meaning}
        </span>
    `).join('');
    
    if (sentence.phrases && sentence.phrases.length > 0) {
        vocabHtml += '<div style="margin-top: 0.4rem;">' + sentence.phrases.map(p => `
            <span class="phrase-tag" style="margin: 0.2rem; display: inline-block;">
                💬 <b>${p.phrase}</b> - ${p.meaning}
            </span>
        `).join('') + '</div>';
    }
    
    document.getElementById('card-back-vocab').innerHTML = vocabHtml;
    
    // ปิด/เปิด ปุ่มถัดไป/ย้อนกลับ
    document.getElementById('btn-card-prev').disabled = index === 0;
    document.getElementById('btn-card-next').disabled = index === sentences.length - 1;
    
    // ปรับสไตล์ปุ่ม Learned
    const learnedBtn = document.getElementById('btn-card-learned');
    learnedBtn.disabled = false;
    
    const isAlreadyLearned = state.learnedSentences.includes(sentence.id);
    if (isAlreadyLearned) {
        learnedBtn.textContent = 'ล้างสถานะจำได้แล้ว';
        learnedBtn.className = 'btn btn-secondary';
    } else {
        learnedBtn.innerHTML = `
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="margin-right: 4px;">
                <path d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg> จำประโยคนี้ได้แล้ว
        `;
        learnedBtn.className = 'btn btn-primary';
    }
    
    document.getElementById('btn-card-remove').disabled = false;
}

function flipCard() {
    state.isCardFlipped = !state.isCardFlipped;
    const inner = document.getElementById('flashcard-inner');
    if (state.isCardFlipped) {
        inner.classList.add('is-flipped');
    } else {
        inner.classList.remove('is-flipped');
    }
}

function markCardLearned() {
    const sentences = getFilteredSentences();
    const sentence = sentences[state.currentCardIndex];
    if (!sentence) return;
    
    const idx = state.learnedSentences.indexOf(sentence.id);
    if (idx > -1) {
        // ถอนสถานะ
        state.learnedSentences.splice(idx, 1);
        
        // ถอนสถานะแฟลชการ์ดสำหรับเรื่องนั้นด้วย
        if (sentence.storyId) {
            const story = state.savedStories.find(s => s.id === sentence.storyId);
            if (story) {
                story.flashcardMastery = false;
                checkAndAwardStoryStars(story.id);
            }
        }
        
        showToast('ล้างสถานะประโยคนี้แล้ว ต้องเรียนรู้เพิ่มครับ', 'warning');
    } else {
        // เพิ่มสถานะ
        state.learnedSentences.push(sentence.id);
        
        // ได้รับ XP
        addXP(10, 'เรียนรู้จดจำประโยคจากการ์ด');
        
        // ตรวจสอบว่าในเรื่องเดียวกันจำได้ครบทุกการ์ดหรือยัง
        if (sentence.storyId) {
            const story = state.savedStories.find(s => s.id === sentence.storyId);
            if (story) {
                const storySentences = state.savedSentences.filter(s => s.storyId === story.id);
                const allLearned = storySentences.length > 0 && storySentences.every(s => state.learnedSentences.includes(s.id));
                if (allLearned) {
                    story.flashcardMastery = true;
                    story.lastReviewedDate = Date.now(); // ฟื้นฟูเกจ
                    addXP(20, `เรียนการ์ดสะสมเรื่อง "${story.title}" ครบถ้วน`);
                }
                checkAndAwardStoryStars(story.id);
            }
        }
        
        showToast('เก่งมาก! มาร์กประโยคนี้ว่าจำได้แล้วครับ 🎉');
        
        // ถ้าใบถัดไปมีอยู่ ให้ขยับไป
        if (state.currentCardIndex < sentences.length - 1) {
            setTimeout(() => {
                state.currentCardIndex++;
                state.isCardFlipped = false;
                document.getElementById('flashcard-inner').classList.remove('is-flipped');
                showCard(state.currentCardIndex);
            }, 800);
        }
    }
    
    saveDataToLocalStorage();
    updateFlashcardStats();
    showCard(state.currentCardIndex);
}

function removeCurrentCard() {
    if (confirm('คุณต้องการลบประโยคนี้ออกจากประโยคที่บันทึกไว้ใช่หรือไม่?')) {
        const sentences = getFilteredSentences();
        const sentence = sentences[state.currentCardIndex];
        if (!sentence) return;
        
        const storyId = sentence.storyId;
        
        // ลบออกจากเซฟ
        state.savedSentences = state.savedSentences.filter(s => s.id !== sentence.id);
        
        // ลบออกจากสถานะ learned
        const lIdx = state.learnedSentences.indexOf(sentence.id);
        if (lIdx > -1) state.learnedSentences.splice(lIdx, 1);
        
        showToast('ลบประโยคออกเรียบร้อยแล้ว', 'warning');
        
        // ปรับ index และเรนเดอร์ใหม่
        if (state.currentCardIndex >= sentences.length && state.currentCardIndex > 0) {
            state.currentCardIndex--;
        }
        
        if (storyId) {
            const story = state.savedStories.find(s => s.id === storyId);
            if (story) {
                // อัปเดตเช็คความชำนาญแฟลชการ์ดของเรื่องเล่าใหม่
                const storySentences = state.savedSentences.filter(s => s.storyId === story.id);
                const allLearned = storySentences.length > 0 && storySentences.every(s => state.learnedSentences.includes(s.id));
                story.flashcardMastery = allLearned;
                checkAndAwardStoryStars(story.id);
            }
        }
        
        saveDataToLocalStorage();
        updateFlashcardStats();
        initFlashcards();
    }
}

// ==========================================================================
// 7. CHALLENGES MODULE (ระบบควิซแบบทดสอบเรียงคำ/เติมคำ)
// ==========================================================================
function initQuiz() {
    // ซ่อนข้อความฟีดแบคทั้งหมด
    document.getElementById('quiz-feedback-correct').style.display = 'none';
    document.getElementById('quiz-feedback-incorrect').style.display = 'none';
    document.getElementById('btn-quiz-next').style.display = 'none';
    document.getElementById('btn-quiz-check').style.display = 'block';
    
    // คัดเลือกประโยคที่จะใช้ทำควิซ
    const sentences = getFilteredQuizSentences();
    
    if (sentences.length === 0) {
        document.getElementById('quiz-empty-placeholder').style.display = 'flex';
        document.getElementById('quiz-arena').style.display = 'none';
        if (document.getElementById('quiz-completed-arena')) {
            document.getElementById('quiz-completed-arena').style.display = 'none';
        }
        return;
    }
    
    document.getElementById('quiz-empty-placeholder').style.display = 'none';
    
    // คัดเลือกเฉพาะข้อที่ยังไม่ได้ทำถูกต้องในเซสชันนี้
    if (!state.quizCompletedSentences) {
        state.quizCompletedSentences = [];
    }
    let pool = sentences.filter(s => !state.quizCompletedSentences.includes(s.id));
    
    if (pool.length === 0) {
        // ตอบถูกครบถ้วนทุกประโยคในกลุ่มแล้ว
        document.getElementById('quiz-arena').style.display = 'none';
        if (document.getElementById('quiz-completed-arena')) {
            document.getElementById('quiz-completed-arena').style.display = 'flex';
        }
        return;
    }
    
    if (document.getElementById('quiz-completed-arena')) {
        document.getElementById('quiz-completed-arena').style.display = 'none';
    }
    document.getElementById('quiz-arena').style.display = 'flex';
    
    // สุ่มเลือกประโยค
    const randomIndex = Math.floor(Math.random() * pool.length);
    state.currentQuizSentence = pool[randomIndex];
    
    // แสดงคำใบ้ภาษาไทย
    document.getElementById('quiz-thai-hint').textContent = state.currentQuizSentence.thai;
    
    // ตรวจสอบชนิดเกมที่ถูกเลือก
    const activeTypeCard = document.querySelector('.challenge-type-card.active');
    state.currentQuizType = activeTypeCard ? activeTypeCard.getAttribute('data-type') : 'blank';
    
    if (state.currentQuizType === 'blank') {
        setupBlankChallenge();
    } else {
        setupPuzzleChallenge();
    }
}

// เกมประเภท 1: เติมคำที่ว่างเปล่าในช่องว่าง
function setupBlankChallenge() {
    document.getElementById('quiz-container-blank').style.display = 'block';
    document.getElementById('quiz-container-puzzle').style.display = 'none';
    
    const sentence = state.currentQuizSentence.english;
    
    // แยกประโยคออกเป็นคำๆ
    const rawWords = sentence.split(/\s+/);
    
    // คำที่พบบ่อยและง่ายเกินไป (ไม่ควรซ่อน)
    const EASY_QUIZ_WORDS = new Set([
        'a', 'an', 'the',
        'i', 'me', 'my', 'myself', 'you', 'your', 'yours', 'yourself', 'yourselves',
        'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself',
        'it', 'its', 'itself', 'we', 'us', 'our', 'ours', 'ourselves',
        'they', 'them', 'their', 'theirs', 'themselves',
        'this', 'that', 'these', 'those', 'here', 'there',
        'who', 'whom', 'whose', 'which', 'what', 'whose', 'whoever', 'whatever',
        'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'do', 'does', 'did', 'done', 'doing',
        'can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must',
        'in', 'on', 'at', 'to', 'for', 'with', 'by', 'of', 'about', 'as', 'from', 'into',
        'through', 'during', 'before', 'after', 'under', 'over', 'between', 'among',
        'out', 'up', 'down', 'off', 'over', 'under', 'again', 'further', 'then', 'once',
        'and', 'but', 'or', 'so', 'yet', 'for', 'nor', 'because', 'although', 'if', 'unless',
        'since', 'while', 'until', 'than', 'though'
    ]);

    const potentialCandidates = [];
    for (let i = 0; i < rawWords.length; i++) {
        const word = rawWords[i];
        const cleanWord = word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g,"");
        const cleanLower = cleanWord.toLowerCase().trim();
        
        // กรองคำที่เหมาะสม: ความยาว > 2, เป็นตัวอักษรภาษาอังกฤษ, และไม่อยู่ใน EASY_QUIZ_WORDS
        if (cleanLower.length > 2 && /^[a-zA-Z'-]+$/.test(cleanLower) && !EASY_QUIZ_WORDS.has(cleanLower)) {
            potentialCandidates.push({ index: i, original: word, clean: cleanWord });
        }
    }

    let targetIndex = -1;
    let foundWord = '';
    let wordToHide = '';

    if (potentialCandidates.length > 0) {
        const chosen = potentialCandidates[Math.floor(Math.random() * potentialCandidates.length)];
        targetIndex = chosen.index;
        foundWord = chosen.original;
        wordToHide = chosen.clean;
    } else {
        // Fallback 1: ถ้าไม่พบคำระดับปานกลาง/ยาก ลองหาคำทั่วไปที่ยาวมากกว่า 3 ตัวอักษร
        const fallbackCandidates = [];
        for (let i = 0; i < rawWords.length; i++) {
            const word = rawWords[i];
            const cleanWord = word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g,"");
            const cleanLower = cleanWord.toLowerCase().trim();
            if (cleanLower.length > 3 && /^[a-zA-Z'-]+$/.test(cleanLower)) {
                fallbackCandidates.push({ index: i, original: word, clean: cleanWord });
            }
        }
        if (fallbackCandidates.length > 0) {
            const chosen = fallbackCandidates[Math.floor(Math.random() * fallbackCandidates.length)];
            targetIndex = chosen.index;
            foundWord = chosen.original;
            wordToHide = chosen.clean;
        } else {
            // Fallback 2: เลือกคำที่ยาวที่สุดในประโยค
            let longestIndex = 0;
            let longestWord = '';
            let longestClean = '';
            for (let i = 0; i < rawWords.length; i++) {
                const word = rawWords[i];
                const cleanWord = word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g,"");
                if (cleanWord.length > longestClean.length) {
                    longestClean = cleanWord;
                    longestWord = word;
                    longestIndex = i;
                }
            }
            if (longestClean.length > 0) {
                targetIndex = longestIndex;
                foundWord = longestWord;
                wordToHide = longestClean;
            } else {
                // ฉุกเฉินจริงๆ: เลือกคำกลางประโยค
                const mid = Math.floor(rawWords.length / 2);
                targetIndex = mid;
                foundWord = rawWords[mid];
                wordToHide = rawWords[mid].replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g,"");
            }
        }
    }
    
    // บันทึกคำตอบที่ถูกต้อง
    state.currentQuizAnswer = wordToHide.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g,"").trim();
    
    // สร้าง HTML สำหรับประโยคโดยเว้นคำนั้นไว้
    const container = document.getElementById('quiz-container-blank');
    container.innerHTML = '';
    
    rawWords.forEach((word, idx) => {
        if (idx === targetIndex) {
            // สร้างกล่อง input แทนคำนั้น
            // เช็คเครื่องหมายวรรคตอนด้านท้ายคำ
            let punctuation = '';
            const match = word.match(/[.,\/#!$%\^&\*;:{}=\-_`~()?]+$/);
            if (match) punctuation = match[0];
            
            // คำนวณความกว้าง input
            const inputWidth = Math.max(80, wordToHide.length * 15);
            container.innerHTML += `<input type="text" class="sentence-blank-input" id="quiz-blank-input" style="width: ${inputWidth}px;" autocomplete="off" placeholder="?">${punctuation} `;
        } else {
            container.innerHTML += word + ' ';
        }
    });
    
    // โฟกัสไปที่ช่องใส่คำตอบ
    setTimeout(() => {
        const input = document.getElementById('quiz-blank-input');
        if (input) input.focus();
    }, 100);
}

// เกมประเภท 2: เรียงคำศัพท์สลับตำแหน่งในประโยค
function setupPuzzleChallenge() {
    document.getElementById('quiz-container-blank').style.display = 'none';
    document.getElementById('quiz-container-puzzle').style.display = 'block';
    
    const sentence = state.currentQuizSentence.english;
    
    // แยกตัวอักษรและล้างเครื่องหมายวรรคตอนท้ายคำชั่วคราว
    const words = sentence.split(/\s+/).map(w => w.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g,"").trim()).filter(w => w.length > 0);
    
    state.quizOriginalWords = [...words];
    state.quizSelectedWords = [];
    
    // สลับตำแหน่งคำ (Shuffle)
    const shuffled = [...words];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    // ถ้าสลับแล้วยังเหมือนเดิม ให้สลับใหม่สักรอบ
    if (JSON.stringify(shuffled) === JSON.stringify(words) && shuffled.length > 1) {
        [shuffled[0], shuffled[shuffled.length - 1]] = [shuffled[shuffled.length - 1], shuffled[0]];
    }
    
    renderPuzzlePool(shuffled);
    renderPuzzleSlots();
}

function renderPuzzlePool(words) {
    const container = document.getElementById('puzzle-pool-container');
    container.innerHTML = '';
    
    words.forEach((word, index) => {
        const tile = document.createElement('div');
        tile.className = 'word-tile';
        tile.textContent = word;
        tile.addEventListener('click', () => {
            // ย้ายจาก pool ไปยัง slots
            state.quizSelectedWords.push(word);
            tile.style.opacity = '0.3';
            tile.style.pointerEvents = 'none';
            renderPuzzleSlots();
        });
        container.appendChild(tile);
    });
}

function renderPuzzleSlots() {
    const container = document.getElementById('puzzle-slots-container');
    container.innerHTML = '';
    
    if (state.quizSelectedWords.length === 0) {
        container.innerHTML = `<span style="color: var(--text-muted); font-size: 0.95rem;">คลิกคำศัพท์ด้านล่างเพื่อเรียงประโยคที่ถูกต้อง...</span>`;
        return;
    }
    
    state.quizSelectedWords.forEach((word, index) => {
        const tile = document.createElement('div');
        tile.className = 'word-tile';
        tile.textContent = word;
        tile.style.background = 'var(--gradient-accent)';
        tile.addEventListener('click', () => {
            // เอาคำนี้ออกจาก slots และกลับไปเปิดใช้งานที่ pool
            state.quizSelectedWords.splice(index, 1);
            
            // หาคำที่ถูกซ่อนใน pool แล้วเปิดใช้งานใหม่
            const poolTiles = document.querySelectorAll('#puzzle-pool-container .word-tile');
            for (let t of poolTiles) {
                if (t.textContent === word && t.style.opacity === '0.3') {
                    t.style.opacity = '1';
                    t.style.pointerEvents = 'auto';
                    break;
                }
            }
            
            renderPuzzleSlots();
        });
        container.appendChild(tile);
    });
}

// ตรวจสอบคำตอบ
function checkQuizAnswer() {
    let isCorrect = false;
    let userSentence = '';
    let correctSentence = state.currentQuizSentence.english;
    
    if (state.currentQuizType === 'blank') {
        const inputEl = document.getElementById('quiz-blank-input');
        if (!inputEl) return;
        
        const userInput = inputEl.value.trim().toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g,"");
        userSentence = userInput;
        isCorrect = userInput === state.currentQuizAnswer;
    } else {
        // สำหรับ Reorder
        userSentence = state.quizSelectedWords.join(' ').toLowerCase();
        const cleanCorrectSentence = state.quizOriginalWords.join(' ').toLowerCase();
        isCorrect = userSentence === cleanCorrectSentence;
    }
    
    // ล้างและแสดงผลลัพธ์
    document.getElementById('btn-quiz-check').style.display = 'none';
    document.getElementById('btn-quiz-next').style.display = 'block';
    
    // ดึงส่วน Vocab มาแสดงอธิบายเพิ่มเติม
    const vocabList = state.currentQuizSentence.vocabulary || [];
    const explanations = vocabList.map(v => `<b>${v.word}</b> [${v.phonetic}]: ${v.meaning}`).join('<br>');
    
    if (isCorrect) {
        // ได้รับ XP
        addXP(5, 'ตอบควิซประโยคถูกต้อง');
        
        // บันทึกความสำเร็จลงในคิวของเซสชันนี้
        if (!state.quizCompletedSentences) {
            state.quizCompletedSentences = [];
        }
        if (!state.quizCompletedSentences.includes(state.currentQuizSentence.id)) {
            state.quizCompletedSentences.push(state.currentQuizSentence.id);
        }
        
        // เช็คความชำนาญควิซสำหรับเรื่องเล่าสั้น
        if (state.currentQuizSentence.storyId) {
            const story = state.savedStories.find(s => s.id === state.currentQuizSentence.storyId);
            if (story) {
                if (story.quizCorrectCount === undefined) {
                    story.quizCorrectCount = 0;
                }
                story.quizCorrectCount++;
                
                // เกณฑ์ผ่านควิซความชำนาญคือตอบถูก 3 ข้อขึ้นไปสำหรับประโยคในเรื่องนั้น
                if (story.quizCorrectCount >= 3) {
                    if (!story.quizMastery) {
                        story.quizMastery = true;
                        story.lastReviewedDate = Date.now(); // ฟื้นฟูเกจ
                        addXP(30, `ตอบควิซของเรื่อง "${story.title}" ถูกสะสมครบ 3 ข้อ`);
                    }
                }
                checkAndAwardStoryStars(story.id);
            }
        }
        
        const successAlert = document.getElementById('quiz-feedback-correct');
        const correctBody = document.getElementById('quiz-correct-body');
        
        correctBody.innerHTML = `
            <p style="font-size: 1.15rem; margin-bottom: 0.5rem; color: #fff;">"${correctSentence}"</p>
            <hr style="border: none; border-top: 1px solid rgba(255, 255, 255, 0.1); margin: 0.5rem 0;">
            <p style="font-size: 0.85rem; color: var(--text-muted);">💡 ศัพท์น่ารู้:</p>
            <p style="font-size: 0.85rem; color: #fff;">${explanations}</p>
        `;
        successAlert.style.display = 'flex';
        speakText(correctSentence); // อ่านเสียงเฉลยที่ถูก
    } else {
        const errorAlert = document.getElementById('quiz-feedback-incorrect');
        const incorrectBody = document.getElementById('quiz-incorrect-body');
        
        incorrectBody.innerHTML = `
            <p style="font-size: 1.15rem; margin-bottom: 0.5rem; color: #fff;">"${correctSentence}"</p>
            <hr style="border: none; border-top: 1px solid rgba(255, 255, 255, 0.1); margin: 0.5rem 0;">
            <p style="font-size: 0.85rem; color: var(--text-muted);">💡 ศัพท์น่ารู้:</p>
            <p style="font-size: 0.85rem; color: #fff;">${explanations}</p>
        `;
        errorAlert.style.display = 'flex';
    }
}

// ==========================================================================
// 8. AI TUTOR CHAT MODULE (ระบบฝึกสนทนากับคุณครู AI)
// ==========================================================================
async function sendChatMessage() {
    const inputEl = document.getElementById('chat-input-msg');
    const msgText = inputEl.value.trim();
    if (!msgText) return;
    
    // แสดงข้อความฝั่งผู้ใช้
    appendChatMessage('user', msgText);
    inputEl.value = '';
    
    // ตั้งข้อความ AI รอการตอบกลับแบบ Loading
    const loadingBubble = appendChatMessage('assistant', 'กำลังคิดคำตอบและวิเคราะห์ไวยากรณ์...');
    
    // อัปเดตประวัติแชทหลัก
    state.chatHistory.push({ role: 'user', parts: [{ text: msgText }] });
    if (state.chatHistory.length > 20) {
        state.chatHistory.shift(); // ควบคุมความยาวของประวัติเพื่อประหยัด Token
    }
    
    // สร้าง Prompt โต้ตอบโดยแนบประวัติ
    const persona = PERSONA_CONFIGS[state.chatPersona];
    const systemPrompt = persona.systemInstruction;
    
    // ประกอบเป็นแชท
    // เนื่องจากเราต้องการเก็บ context เราสามารถส่งคุยแบบ multi-turn หรือส่ง prompt ที่เรียงประวัติกัน
    let fullPrompt = `Below is the conversation history with the user. Reply to the last user message according to your role.\n\n`;
    state.chatHistory.forEach(item => {
        fullPrompt += `${item.role === 'user' ? 'User' : 'Assistant'}: ${item.parts[0].text}\n`;
    });
    fullPrompt += `Assistant: `;
    
    const reply = await callGeminiAPI(fullPrompt, systemPrompt, false);
    
    // เอา bubble loading ออก และใส่ bubble คำตอบจริง
    loadingBubble.remove();
    
    if (reply) {
        // แปลงเครื่องหมายขึ้นบรรทัดใหม่เป็น <br>
        const cleanReply = reply.replace(/\n/g, '<br>');
        appendChatMessage('assistant', cleanReply);
        
        state.chatHistory.push({ role: 'model', parts: [{ text: reply }] });
    } else {
        appendChatMessage('assistant', 'ขออภัยครับ เกิดข้อผิดพลาดในการเชื่อมต่อกับ Gemini Pro กรุณาตรวจสอบ API Key ในหน้าตั้งค่าหรือตรวจสอบสัญญาณอินเทอร์เน็ตครับ');
    }
}

function appendChatMessage(role, text) {
    const container = document.getElementById('chat-messages');
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${role}`;
    bubble.innerHTML = text;
    
    container.appendChild(bubble);
    
    // ออโต้สกรอลลงล่างสุด
    container.scrollTop = container.scrollHeight;
    
    return bubble;
}

function resetChatConversation() {
    state.chatHistory = [];
    const container = document.getElementById('chat-messages');
    container.innerHTML = `
        <div class="chat-bubble assistant">
            ล้างข้อมูลและเริ่มต้นบทสนทนาใหม่เรียบร้อยครับ! วันนี้คุณอยากสวมบทบาทคุยหรือแต่งประโยคภาษาอังกฤษเรื่องอะไร ลองพิมพ์บอกผมได้เลยครับ 😊
        </div>
    `;
    showToast('รีเซ็ตบทสนทนาเรียบร้อยแล้ว');
}

// ==========================================================================
// 9. WORD BANK MODULE (ระบบคลังคำศัพท์สะสม)
// ==========================================================================
function renderVocabBank() {
    const container = document.getElementById('vocab-cards-container');
    const emptyPlaceholder = document.getElementById('vocab-empty-placeholder');
    const searchInput = document.getElementById('vocab-search-input').value.trim().toLowerCase();
    
    container.innerHTML = '';
    
    // กรองคำศัพท์ตามการค้นหา
    const filteredVocab = state.vocabBank.filter(v => v.word.toLowerCase().includes(searchInput));
    
    if (filteredVocab.length === 0) {
        emptyPlaceholder.style.display = 'flex';
        return;
    }
    
    emptyPlaceholder.style.display = 'none';
    
    filteredVocab.forEach((vocab, index) => {
        const card = document.createElement('div');
        card.className = 'vocab-card';
        card.innerHTML = `
            <button class="vocab-delete-btn" title="ลบคำศัพท์">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
            <div class="vocab-word-header">
                <span class="vocab-term">${vocab.word}</span>
                <span class="vocab-ipa">${vocab.phonetic || ''}</span>
            </div>
            <div class="vocab-definition">${vocab.meaning}</div>
            ${vocab.example ? `<div class="vocab-example"><b>Ex:</b> ${vocab.example}</div>` : ''}
        `;
        
        // ผูกปุ่มออกเสียงเมื่อคลิกชื่อคำศัพท์
        card.querySelector('.vocab-term').addEventListener('click', () => {
            speakText(vocab.word);
        });
        
        // ผูกปุ่มลบคำศัพท์
        card.querySelector('.vocab-delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteVocab(vocab.word);
        });
        
        container.appendChild(card);
    });
}

function deleteVocab(word) {
    if (confirm(`คุณต้องการลบคำศัพท์ "${word}" ออกจากคลังใช่หรือไม่?`)) {
        state.vocabBank = state.vocabBank.filter(v => v.word.toLowerCase() !== word.toLowerCase());
        saveDataToLocalStorage();
        renderVocabBank();
        showToast(`ลบคำศัพท์ "${word}" เรียบร้อยแล้ว`, 'warning');
    }
}

// ==========================================================================
// 10. SYSTEM SETTINGS MODULE (ตั้งค่าเซฟคีย์และรีเซ็ตระบบ)
// ==========================================================================
async function saveApiKey() {
    const keyInput = document.getElementById('settings-api-key').value.trim();
    if (!keyInput) {
        showToast('กรุณากรอก API Key ก่อนกดบันทึกครับ', 'error');
        return;
    }
    
    state.apiKey = keyInput;
    localStorage.setItem('engbuddy_api_key', keyInput);
    updateApiStatusDisplay();
    showToast('บันทึก API Key สำเร็จแล้ว!');
    
    // ลองทดสอบคีย์ทันที
    testApiKey(false);
}

async function testApiKey(showSuccessAlert = true) {
    const isUsingProxy = !state.apiKey;
    const btn = document.getElementById('btn-settings-test-api');
    const originalText = btn ? btn.textContent : 'ทดสอบการเชื่อมต่อ (Test)';
    
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'กำลังทดสอบ...';
    }
    
    const testPrompt = "Reply with only 'Hello'";
    const res = await callGeminiAPI(testPrompt, "You are a test assistant.");
    
    if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
    }
    
    if (res && res.toLowerCase().includes('hello')) {
        if (isUsingProxy) {
            alert('🟢 เชื่อมต่อคลาวด์สำเร็จ!\nระบบตอบกลับจาก Gemini สำเร็จแล้ว (Free AI พร้อมใช้งาน) 🎉');
        } else {
            alert('🟢 เชื่อมต่อสำเร็จ!\nAPI Key ของคุณถูกต้องและใช้งานได้สมบูรณ์ครับ 🎉');
        }
        updateApiStatusDisplay();
    } else {
        const errorDetail = state.lastApiError || 'ไม่พบข้อความตอบกลับจาก API (ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต)';
        if (isUsingProxy) {
            alert(`🔴 การเชื่อมต่อคลาวด์ล้มเหลว!\n\nสาเหตุหลัก: ${errorDetail}\n\nคำแนะนำ: กรุณาตรวจสอบว่าสร้างตัวแปร GEMINI_API_KEY ในหน้า Settings -> Variables -> Environment Variables ของ Cloudflare Worker ถูกต้องแล้วหรือยัง หรืออินเทอร์เน็ตมีปัญหาครับ`);
        } else {
            alert(`🔴 การเชื่อมต่อล้มเหลว!\n\nสาเหตุหลัก: ${errorDetail}\n\nกรุณาตรวจสอบว่า API Key ที่กรอกถูกต้องหรือไม่ครับ`);
        }
    }
}

function resetEntireApp() {
    if (confirm('⚠️ คำเตือน: คุณต้องการลบข้อมูลทั้งหมดในแอปพลิเคชัน (คีย์ API, ประโยคสะสม, คำศัพท์) หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้')) {
        localStorage.clear();
        
        // สุ่มสร้าง Sync ID ใหม่หลังล้างข้อมูลเครื่อง
        state.userId = 'eb_user_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString().slice(-4);
        localStorage.setItem('engbuddy_user_id', state.userId);
        const syncInput = document.getElementById('sync-profile-id');
        if (syncInput) {
            syncInput.value = state.userId;
        }
        
        state.apiKey = '';
        state.savedSentences = [];
        state.learnedSentences = [];
        state.vocabBank = [];
        state.savedStories = [];
        state.audioSpeed = 0.9;
        state.audioVoice = '';
        state.chatHistory = [];
        state.currentReader = null;
        state.readerReadCompleted = false;
        
        // ซ่อนหน้าแสดงวิเคราะห์ข้อความตัวเอง
        const displaySec = document.getElementById('reader-display');
        const placeholder = document.getElementById('reader-placeholder');
        if (displaySec) displaySec.style.display = 'none';
        if (placeholder) placeholder.style.display = 'block';
        
        document.getElementById('settings-api-key').value = '';
        const speedInput = document.getElementById('settings-audio-speed');
        if (speedInput) {
            speedInput.value = 0.9;
            document.getElementById('settings-audio-speed-display').textContent = '0.9x';
        }
        const voiceSelect = document.getElementById('settings-audio-voice');
        if (voiceSelect) {
            voiceSelect.value = '';
        }
        updateApiStatusDisplay();
        renderVocabBank();
        renderSavedStoriesList();
        renderSavedReadersList();
        updateStoryFilters();
        updateFlashcardStats();
        initFlashcards();
        resetChatConversation();
        
        showToast('รีเซ็ตระบบและลบข้อมูลในเบราว์เซอร์ทั้งหมดแล้ว', 'warning');
        switchView('settings');
    }
}

// ==========================================================================
// 11. GENERAL EVENT LISTENERS (การผูกปุ่มการทำงาน)
// ==========================================================================
function setupEventListeners() {
    // โหมดเรื่องเล่าสั้น
    document.getElementById('btn-generate-story').addEventListener('click', generateStory);
    document.getElementById('btn-save-story').addEventListener('click', toggleSaveStory);
    
    const markReadBtn = document.getElementById('btn-story-mark-read');
    if (markReadBtn) {
        markReadBtn.addEventListener('click', () => {
            if (state.currentStory) {
                markStoryAsRead(state.currentStory.id);
            }
        });
    }
    
    // ฟิลเตอร์เรื่องในหน้า Flashcards / Quiz
    const flashcardFilter = document.getElementById('flashcard-story-filter');
    if (flashcardFilter) {
        flashcardFilter.addEventListener('change', () => {
            state.currentCardIndex = 0;
            updateFlashcardStats();
            initFlashcards();
            
            // แสดง/ซ่อนปุ่มลบกลุ่มฟิลเตอร์
            const btnDeleteGroup = document.getElementById('btn-delete-filter-group');
            if (btnDeleteGroup) {
                if (flashcardFilter.value === 'all') {
                    btnDeleteGroup.style.display = 'none';
                } else {
                    btnDeleteGroup.style.display = 'flex';
                }
            }
        });
    }
    
    const btnDeleteFilterGroup = document.getElementById('btn-delete-filter-group');
    if (btnDeleteFilterGroup) {
        btnDeleteFilterGroup.addEventListener('click', deleteFilterGroup);
    }
    
    document.getElementById('quiz-story-filter').addEventListener('change', () => {
        state.quizCompletedSentences = [];
        initQuiz();
    });
    
    // การคลิกแท็กหัวข้อด่วน
    const tags = document.querySelectorAll('.topic-tag');
    tags.forEach(tag => {
        tag.addEventListener('click', () => {
            tags.forEach(t => t.classList.remove('selected'));
            tag.classList.add('selected');
            
            // นำหัวข้อลง input
            const fullTopicDescription = TOPIC_PROMPTS[tag.getAttribute('data-topic')] || tag.textContent;
            document.getElementById('story-topic-input').value = fullTopicDescription;
        });
    });
    
    // โหมดการ์ดทบทวน
    document.getElementById('flashcard-inner').addEventListener('click', flipCard);
    document.getElementById('btn-card-flip').addEventListener('click', flipCard);
    document.getElementById('btn-card-learned').addEventListener('click', markCardLearned);
    document.getElementById('btn-card-remove').addEventListener('click', removeCurrentCard);
    
    document.getElementById('btn-card-prev').addEventListener('click', () => {
        if (state.currentCardIndex > 0) {
            state.currentCardIndex--;
            state.isCardFlipped = false;
            document.getElementById('flashcard-inner').classList.remove('is-flipped');
            showCard(state.currentCardIndex);
        }
    });
    document.getElementById('btn-card-next').addEventListener('click', () => {
        const sentences = getFilteredSentences();
        if (state.currentCardIndex < sentences.length - 1) {
            state.currentCardIndex++;
            state.isCardFlipped = false;
            document.getElementById('flashcard-inner').classList.remove('is-flipped');
            showCard(state.currentCardIndex);
        }
    });
    
    // ผูกเสียงอ่านของหน้าการ์ดโดยเฉพาะ (ไม่ให้เกิด flip เมื่อคลิก)
    document.getElementById('btn-card-voice').addEventListener('click', (e) => {
        e.stopPropagation();
        const sentences = getFilteredSentences();
        const sentence = sentences[state.currentCardIndex];
        if (sentence) speakText(sentence.english);
    });
    
    // โหมดทำควิซ
    document.getElementById('btn-quiz-check').addEventListener('click', checkQuizAnswer);
    document.getElementById('btn-quiz-next').addEventListener('click', initQuiz);
    document.getElementById('btn-quiz-replay').addEventListener('click', () => {
        state.quizCompletedSentences = [];
        initQuiz();
    });
    
    // โหมดเปลี่ยนชนิดควิซ
    const challengeTypes = document.querySelectorAll('.challenge-type-card');
    challengeTypes.forEach(card => {
        card.addEventListener('click', () => {
            challengeTypes.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            state.quizCompletedSentences = []; // ล้างเซสชันควิซเมื่อเปลี่ยนประเภท
            initQuiz();
        });
    });
    
    // โหมดแชท AI Tutor
    document.getElementById('btn-send-chat').addEventListener('click', sendChatMessage);
    document.getElementById('chat-input-msg').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChatMessage();
    });
    document.getElementById('btn-reset-chat').addEventListener('click', resetChatConversation);
    
    // โหมดเปลี่ยนบุคลิกติวเตอร์
    const personaOptions = document.querySelectorAll('.persona-option');
    personaOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            personaOptions.forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            state.chatPersona = opt.getAttribute('data-persona');
            
            // รีเซ็ตเพื่อเริ่มต้นแชทใหม่ของติวเตอร์นั้นๆ
            state.chatHistory = [];
            let welcomeMsg = '';
            if (state.chatPersona === 'friend') {
                welcomeMsg = 'หวัดดีเพื่อน! ผม Buddy นะครับ วันนี้พร้อมลุยคุยภาษาอังกฤษกันแบบสบายๆ หรือยัง? พิมพ์อะไรมาคุยกันได้เลยชิวๆ เดี๋ยวผมช่วยแชร์ประโยคที่ฟังดูเป็นธรรมชาติเพิ่มให้ครับ 😊';
            } else if (state.chatPersona === 'coach') {
                welcomeMsg = 'สวัสดีนักเรียน! ผมคือ Strict Grammar Coach ผมจะคอยช่วยสแกนทุกตัวอักษรที่คุณเขียน หากคุณมีประโยคสะสมตรงไหนลองส่งมาได้เลย เดี๋ยวผมแจกแจงโครงสร้างแกรมม่าที่ถูกต้องให้เป็นข้อๆ ครับ 👩‍🏫';
            } else {
                welcomeMsg = 'สวัสดีครับ ผมคือ Business English Mentor ของคุณ มีอะไรเกี่ยวกับการพิมพ์อีเมลสมัครงาน นำเสนองาน หรือภาษาอังกฤษใช้เจรจาธุรกิจที่อยากแชร์มาทบทวนแลกเปลี่ยนไหมครับ? 💼';
            }
            const container = document.getElementById('chat-messages');
            container.innerHTML = `<div class="chat-bubble assistant">${welcomeMsg}</div>`;
        });
    });
    
    // โหมดคลังศัพท์สะสม
    document.getElementById('vocab-search-input').addEventListener('input', renderVocabBank);
    
    // โหมดตั้งค่าระบบ
    document.getElementById('btn-settings-save').addEventListener('click', saveApiKey);
    document.getElementById('btn-settings-test-api').addEventListener('click', () => testApiKey(true));
    document.getElementById('btn-reset-app').addEventListener('click', resetEntireApp);
    
    // ระบบคลาวด์ซิงค์ข้อมูล
    document.getElementById('btn-sync-copy').addEventListener('click', () => {
        const idInput = document.getElementById('sync-profile-id');
        if (idInput && idInput.value) {
            idInput.select();
            navigator.clipboard.writeText(idInput.value).then(() => {
                showToast("คัดลอกรหัส Sync ID ลงคลิปบอร์ดแล้ว!", "success");
            }).catch(err => {
                console.error("Failed to copy text:", err);
                showToast("ไม่สามารถคัดลอกรหัสได้โดยอัตโนมัติ", "warning");
            });
        }
    });
    
    document.getElementById('btn-sync-load').addEventListener('click', () => {
        const loadInput = document.getElementById('sync-load-id');
        if (!loadInput) return;
        
        const targetId = loadInput.value.trim();
        if (!targetId) {
            showToast("กรุณากรอกรหัส Sync ID ก่อนปุ่มซิงค์ครับ", "warning");
            return;
        }
        
        if (confirm("⚠️ คำเตือน: การโหลดข้อมูลคลาวด์ซิงค์นี้จะเขียนข้อมูลทับข้อมูลปัจจุบันของคุณในเครื่องนี้ทั้งหมด! คุณแน่ใจว่าต้องการดำเนินการต่อหรือไม่?")) {
            loadDataFromFirebase(targetId).then(success => {
                if (success) {
                    loadInput.value = '';
                }
            });
        }
    });
    
    // ระบบสำรองและกู้คืนข้อมูลด้วยตนเอง (Manual Sync)
    document.getElementById('btn-manual-generate').addEventListener('click', generateManualBackupString);
    document.getElementById('btn-manual-copy').addEventListener('click', () => {
        const manualText = document.getElementById('sync-manual-data');
        if (manualText && manualText.value) {
            manualText.select();
            navigator.clipboard.writeText(manualText.value).then(() => {
                showToast("คัดลอกข้อความรหัสสำรองลงคลิปบอร์ดแล้ว!", "success");
            }).catch(err => {
                console.error("Failed to copy text:", err);
                showToast("ไม่สามารถคัดลอกข้อความสำรองได้โดยอัตโนมัติ", "warning");
            });
        }
    });
    document.getElementById('btn-manual-restore').addEventListener('click', () => {
        if (confirm("⚠️ คำเตือน: การกู้คืนข้อมูลนี้จะเขียนข้อมูลทับข้อมูลปัจจุบันของคุณในเครื่องนี้ทั้งหมด! คุณแน่ใจว่าต้องการกู้คืนข้อมูลหรือไม่?")) {
            restoreManualBackupString();
        }
    });
    
    // ตั้งค่าความเร็วเสียงและโทน
    const speedSlider = document.getElementById('settings-audio-speed');
    if (speedSlider) {
        speedSlider.addEventListener('input', (e) => {
            document.getElementById('settings-audio-speed-display').textContent = e.target.value + 'x';
        });
    }
    document.getElementById('btn-settings-audio-save').addEventListener('click', saveAudioSettings);
    document.getElementById('btn-settings-test-audio').addEventListener('click', testAudioSettings);
    
    // โหมดเครื่องอ่านวิเคราะห์ข้อความ (Custom Reader)
    const btnAnalyzeText = document.getElementById('btn-analyze-text');
    if (btnAnalyzeText) {
        btnAnalyzeText.addEventListener('click', analyzeCustomText);
    }
    const btnReaderMarkRead = document.getElementById('btn-reader-mark-read');
    if (btnReaderMarkRead) {
        btnReaderMarkRead.addEventListener('click', markReaderAsRead);
    }
    const btnReaderSaveAll = document.getElementById('btn-reader-save-all');
    if (btnReaderSaveAll) {
        btnReaderSaveAll.addEventListener('click', saveAllReaderSentences);
    }
    const btnSaveReader = document.getElementById('btn-save-reader');
    if (btnSaveReader) {
        btnSaveReader.addEventListener('click', toggleSaveReader);
    }
}

// ==========================================================================
// 12. GAMIFICATION & REPETITION HELPER FUNCTIONS
// ==========================================================================
function addXP(amount, reason) {
    state.xp += amount;
    const nextLevelXP = state.level * 100;
    
    showToast(`ได้รับ +${amount} XP จาก: ${reason}`);
    
    if (state.xp >= nextLevelXP) {
        state.xp -= nextLevelXP;
        state.level++;
        showToast(`🎉 เลเวลอัป! คุณเลื่อนระดับเป็นเลเวล ${state.level} (${getLevelTitle(state.level)}) แล้วครับ!`, 'success');
    }
    
    saveDataToLocalStorage();
    updateUserStatsUI();
}

function getLevelTitle(level) {
    if (level <= 1) return 'นักเดินทางฝึกหัด';
    if (level <= 3) return 'ผู้เริ่มต้นเรียนรู้';
    if (level <= 5) return 'นักเจรจามืออาชีพ';
    if (level <= 10) return 'ผู้รอบรู้ภาษาสากล';
    return 'ปรมาจารย์ภาษาอังกฤษ';
}

function updateUserStatsUI() {
    const levelEl = document.getElementById('user-level');
    const streakCountEl = document.getElementById('user-streak-count');
    const xpBarEl = document.getElementById('user-xp-bar');
    const xpCurrentEl = document.getElementById('user-xp-current');
    const xpNextEl = document.getElementById('user-xp-next');
    
    if (levelEl) {
        levelEl.textContent = `Lv.${state.level} ${getLevelTitle(state.level)}`;
    }
    if (streakCountEl) {
        streakCountEl.textContent = state.streak;
    }
    
    const nextLevelXP = state.level * 100;
    if (xpCurrentEl) {
        xpCurrentEl.textContent = state.xp;
    }
    if (xpNextEl) {
        xpNextEl.textContent = nextLevelXP;
    }
    if (xpBarEl) {
        const percentage = Math.min(100, Math.floor((state.xp / nextLevelXP) * 100));
        xpBarEl.style.width = `${percentage}%`;
    }
}

function checkDailyStreak() {
    const todayStr = new Date().toDateString();
    
    if (!state.lastActiveDate) {
        state.streak = 1;
        state.lastActiveDate = todayStr;
        saveDataToLocalStorage();
        updateUserStatsUI();
        return;
    }
    
    if (state.lastActiveDate === todayStr) {
        return;
    }
    
    const lastActive = new Date(state.lastActiveDate);
    const today = new Date(todayStr);
    
    const diffTime = today.getTime() - lastActive.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    const diffDays = Math.round(diffTime / oneDay);
    
    if (diffDays === 1) {
        state.streak++;
        state.lastActiveDate = todayStr;
        addXP(20, 'เช็คอินเข้าใช้งานรายวันต่อเนื่อง! 🔥');
    } else if (diffDays > 1) {
        state.streak = 1;
        state.lastActiveDate = todayStr;
        showToast('ยินดีต้อนรับกลับมา! เริ่มต้นสะสมแต้มความต่อเนื่องใหม่อีกครั้งกันครับ 🔥', 'warning');
        addXP(10, 'เริ่มต้นเข้าเรียนรู้วันแรก');
    }
    saveDataToLocalStorage();
    updateUserStatsUI();
}

function markStoryAsRead(storyId) {
    const story = state.savedStories.find(s => s.id === storyId);
    if (!story) {
        showToast('กรุณาบันทึกเรื่องนี้ก่อนทบทวนนะครับ', 'warning');
        return;
    }
    
    if (!story.readMastery) {
        story.readMastery = true;
        story.lastReviewedDate = Date.now();
        addXP(15, `ทบทวนและฝึกออกเสียงเรื่อง "${story.title}"`);
        checkAndAwardStoryStars(story.id);
        showToast('บันทึกการทบทวนอ่านและออกเสียงสำเร็จ! (+15 XP)');
    } else {
        story.lastReviewedDate = Date.now();
        saveDataToLocalStorage();
        renderSavedStoriesList();
        renderSavedReadersList();
        updateStoryFilters();
        showToast('ฟื้นฟูระดับพลังความจำความทรงจำของบทนี้กลับสู่ 100% แล้ว!');
        
        if (state.currentStory && state.currentStory.id === storyId) {
            renderStory(story);
        }
    }
}

function checkAndAwardStoryStars(storyId) {
    const story = state.savedStories.find(s => s.id === storyId);
    if (!story) return;
    
    let count = 0;
    if (story.readMastery) count++;
    if (story.flashcardMastery) count++;
    if (story.quizMastery) count++;
    
    const oldStars = story.stars || 0;
    story.stars = count;
    
    if (count > oldStars) {
        if (count === 3) {
            showToast(`ยินดีด้วย! คุณได้รับระดับความชำนาญขั้นสูงสุด (Mastered 👑) ในเรื่อง "${story.title}" แล้ว!`, 'success');
            addXP(50, `ได้รับเหรียญเกียรติยศระดับความชำนาญสูงสุดสำหรับเรื่อง "${story.title}"`);
        } else {
            showToast(`ยินดีด้วย! คุณสะสมดาวดวงที่ ${count} สำหรับเรื่อง "${story.title}" สำเร็จ!`, 'success');
        }
    }
    
    saveDataToLocalStorage();
    renderSavedStoriesList();
    renderSavedReadersList();
    updateStoryFilters();
    
    if (state.currentStory && state.currentStory.id === storyId) {
        renderStory(story);
    }
    if (state.currentReader && state.currentReader.id === storyId) {
        renderReader(story);
    }
}

// ==========================================================================
// 13. FIREBASE SYNCHRONIZATION HELPER FUNCTIONS
// ==========================================================================
function updateSyncStatus(status, colorText = '') {
    const badge = document.getElementById('sync-status-badge');
    if (!badge) return;
    
    badge.textContent = status;
    if (colorText === 'success') {
        badge.style.background = 'rgba(0, 245, 160, 0.15)';
        badge.style.color = 'var(--color-success)';
    } else if (colorText === 'warning') {
        badge.style.background = 'rgba(255, 123, 0, 0.15)';
        badge.style.color = '#ffae00';
    } else if (colorText === 'error') {
        badge.style.background = 'rgba(255, 0, 127, 0.15)';
        badge.style.color = 'var(--color-accent)';
    } else {
        badge.style.background = 'rgba(255, 255, 255, 0.1)';
        badge.style.color = 'var(--text-muted)';
    }
}

async function saveDataToFirebase() {
    if (!firebaseEnabled || !db || !state.userId) {
        updateSyncStatus("ไม่เปิดใช้งานคลาวด์", "warning");
        return;
    }
    
    try {
        const payload = {
            apiKey: state.apiKey || '',
            savedSentences: state.savedSentences || [],
            learnedSentences: state.learnedSentences || [],
            vocabBank: state.vocabBank || [],
            savedStories: state.savedStories || [],
            audioSpeed: state.audioSpeed || 0.9,
            audioVoice: state.audioVoice || '',
            xp: state.xp || 0,
            level: state.level || 1,
            streak: state.streak || 0,
            lastActiveDate: state.lastActiveDate || '',
            updatedAt: state.updatedAt || Date.now()
        };
        
        await db.collection("users").doc(state.userId).set(payload, { merge: true });
        console.log("Firebase sync completed successfully for user:", state.userId);
        updateSyncStatus("อัปโหลดข้อมูลสำเร็จ ☁️", "success");
    } catch (e) {
        console.error("Error saving data to Firebase:", e);
        updateSyncStatus("เกิดข้อผิดพลาดการอัปโหลด: " + e.message, "error");
    }
}

async function loadDataFromFirebase(targetUserId) {
    if (!firebaseEnabled || !db) {
        showToast("ไม่สามารถเชื่อมต่อคลาวด์ Firebase ได้ในขณะนี้", "error");
        updateSyncStatus("คลาวด์ออฟไลน์", "warning");
        return false;
    }
    
    const cleanUserId = targetUserId.trim();
    if (!cleanUserId) {
        showToast("กรุณากรอกรหัส Sync ID ก่อนซิงค์ครับ", "warning");
        return false;
    }
    
    try {
        showToast("กำลังดึงข้อมูลคลาวด์ซิงค์...", "warning");
        updateSyncStatus("กำลังดาวน์โหลด...", "normal");
        const doc = await db.collection("users").doc(cleanUserId).get();
        
        if (!doc.exists) {
            showToast("ไม่พบข้อมูลโปรไฟล์ของรหัส Sync ID นี้ในระบบคลาวด์", "error");
            updateSyncStatus("ไม่พบโปรไฟล์บนคลาวด์", "warning");
            return false;
        }
        
        const data = doc.data();
        
        // อัปเดต state
        state.userId = cleanUserId;
        state.apiKey = data.apiKey || '';
        state.savedSentences = data.savedSentences || [];
        state.learnedSentences = data.learnedSentences || [];
        state.vocabBank = data.vocabBank || [];
        state.savedStories = data.savedStories || [];
        state.audioSpeed = parseFloat(data.audioSpeed) || 0.9;
        state.audioVoice = data.audioVoice || '';
        state.xp = parseInt(data.xp) || 0;
        state.level = parseInt(data.level) || 1;
        state.streak = parseInt(data.streak) || 0;
        state.lastActiveDate = data.lastActiveDate || '';
        state.updatedAt = data.updatedAt || Date.now();
        
        // เซฟลงเครื่อง LocalStorage ทันที
        localStorage.setItem('engbuddy_user_id', state.userId);
        localStorage.setItem('engbuddy_updated_at', state.updatedAt);
        
        // บันทึกลง LocalStorage
        localStorage.setItem('engbuddy_api_key', state.apiKey); // บันทึกคีย์ API ที่ดึงมาจากคลาวด์
        localStorage.setItem('engbuddy_sentences', JSON.stringify(state.savedSentences));
        localStorage.setItem('engbuddy_learned', JSON.stringify(state.learnedSentences));
        localStorage.setItem('engbuddy_vocab', JSON.stringify(state.vocabBank));
        localStorage.setItem('engbuddy_saved_stories', JSON.stringify(state.savedStories));
        localStorage.setItem('engbuddy_audio_speed', state.audioSpeed);
        localStorage.setItem('engbuddy_audio_voice', state.audioVoice);
        localStorage.setItem('engbuddy_xp', state.xp);
        localStorage.setItem('engbuddy_level', state.level);
        localStorage.setItem('engbuddy_streak', state.streak);
        localStorage.setItem('engbuddy_last_active', state.lastActiveDate);
        
        // อัปเดต UI ทุกหน้า
        document.getElementById('settings-api-key').value = state.apiKey;
        updateApiStatusDisplay(); // อัปเดตจุดสถานะสีเขียวในแถบเมนูข้างซ้าย
        
        const syncInput = document.getElementById('sync-profile-id');
        if (syncInput) {
            syncInput.value = state.userId;
        }
        
        const speedInput = document.getElementById('settings-audio-speed');
        if (speedInput) {
            speedInput.value = state.audioSpeed;
            document.getElementById('settings-audio-speed-display').textContent = state.audioSpeed + 'x';
        }
        
        const voiceSelect = document.getElementById('settings-audio-voice');
        if (voiceSelect) {
            voiceSelect.value = state.audioVoice;
        }
        
        updateUserStatsUI();
        renderVocabBank();
        renderSavedStoriesList();
        renderSavedReadersList();
        updateStoryFilters();
        updateFlashcardStats();
        initFlashcards();
        
        showToast("ซิงค์ข้อมูลคลาวด์เชื่อมโยงโปรไฟล์สำเร็จแล้ว! 🎉", "success");
        updateSyncStatus("เชื่อมโยงและซิงค์ข้อมูลแล้ว ☁️", "success");
        return true;
    } catch (e) {
        console.error("Error loading data from Firebase:", e);
        showToast("เกิดข้อผิดพลาดในการโหลดข้อมูล: " + e.message, "error");
        updateSyncStatus("เกิดข้อผิดพลาดคลาวด์: " + e.message, "error");
        return false;
    }
}

// ==========================================================================
// 14. MANUAL BACKUP & RESTORE HELPER FUNCTIONS (ระบบสำรอง/กู้คืนแบบพิมพ์ข้อความ)
// ==========================================================================
function generateManualBackupString() {
    const payload = {
        apiKey: state.apiKey || '',
        savedSentences: state.savedSentences || [],
        learnedSentences: state.learnedSentences || [],
        vocabBank: state.vocabBank || [],
        savedStories: state.savedStories || [],
        audioSpeed: state.audioSpeed || 0.9,
        audioVoice: state.audioVoice || '',
        xp: state.xp || 0,
        level: state.level || 1,
        streak: state.streak || 0,
        lastActiveDate: state.lastActiveDate || '',
        updatedAt: Date.now()
    };
    try {
        const jsonStr = JSON.stringify(payload);
        const base64 = btoa(encodeURIComponent(jsonStr).replace(/%([0-9A-F]{2})/g, function(match, p1) {
            return String.fromCharCode(parseInt(p1, 16));
        }));
        
        const textarea = document.getElementById('sync-manual-data');
        if (textarea) {
            textarea.value = base64;
        }
        const copyBtn = document.getElementById('btn-manual-copy');
        if (copyBtn) {
            copyBtn.disabled = false;
        }
        showToast("สร้างข้อความสำรองข้อมูลสำเร็จแล้วครับ! 💾", "success");
    } catch (e) {
        console.error("Error generating backup:", e);
        showToast("เกิดข้อผิดพลาดในการสร้างข้อมูลสำรอง", "error");
    }
}

function restoreManualBackupString() {
    const textarea = document.getElementById('sync-manual-import');
    if (!textarea) return;
    const base64 = textarea.value.trim();
    if (!base64) {
        showToast("กรุณาวางรหัสข้อความสำรองก่อนครับ", "warning");
        return;
    }
    
    try {
        const jsonStr = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        
        const data = JSON.parse(jsonStr);
        if (!data || !data.savedSentences) {
            throw new Error("Invalid data structure");
        }
        
        state.apiKey = data.apiKey || '';
        state.savedSentences = data.savedSentences || [];
        state.learnedSentences = data.learnedSentences || [];
        state.vocabBank = data.vocabBank || [];
        state.savedStories = data.savedStories || [];
        state.audioSpeed = parseFloat(data.audioSpeed) || 0.9;
        state.audioVoice = data.audioVoice || '';
        state.xp = parseInt(data.xp) || 0;
        state.level = parseInt(data.level) || 1;
        state.streak = parseInt(data.streak) || 0;
        state.lastActiveDate = data.lastActiveDate || '';
        
        localStorage.setItem('engbuddy_api_key', state.apiKey);
        localStorage.setItem('engbuddy_sentences', JSON.stringify(state.savedSentences));
        localStorage.setItem('engbuddy_learned', JSON.stringify(state.learnedSentences));
        localStorage.setItem('engbuddy_vocab', JSON.stringify(state.vocabBank));
        localStorage.setItem('engbuddy_saved_stories', JSON.stringify(state.savedStories));
        localStorage.setItem('engbuddy_audio_speed', state.audioSpeed);
        localStorage.setItem('engbuddy_audio_voice', state.audioVoice);
        localStorage.setItem('engbuddy_xp', state.xp);
        localStorage.setItem('engbuddy_level', state.level);
        localStorage.setItem('engbuddy_streak', state.streak);
        localStorage.setItem('engbuddy_last_active', state.lastActiveDate);
        
        document.getElementById('settings-api-key').value = state.apiKey;
        updateApiStatusDisplay();
        
        const speedInput = document.getElementById('settings-audio-speed');
        if (speedInput) {
            speedInput.value = state.audioSpeed;
            document.getElementById('settings-audio-speed-display').textContent = state.audioSpeed + 'x';
        }
        
        const voiceSelect = document.getElementById('settings-audio-voice');
        if (voiceSelect) {
            voiceSelect.value = state.audioVoice;
        }
        
        updateUserStatsUI();
        renderVocabBank();
        renderSavedStoriesList();
        renderSavedReadersList();
        updateStoryFilters();
        updateFlashcardStats();
        initFlashcards();
        
        showToast("กู้คืนข้อมูลสำรองเสร็จสมบูรณ์แล้วครับ! 🎉", "success");
        updateSyncStatus("กู้คืนข้อความสำรองสำเร็จ 💾", "success");
        textarea.value = '';
    } catch (e) {
        console.error("Error restoring backup:", e);
        showToast("รหัสข้อความสำรองไม่ถูกต้อง ไม่สามารถกู้คืนได้ครับ", "error");
    }
}

async function autoSyncOnStartup() {
    if (!firebaseEnabled || !db || !state.userId) {
        updateSyncStatus("ไม่เปิดใช้งานคลาวด์", "warning");
        return;
    }
    
    updateSyncStatus("กำลังเชื่อมต่อคลาวด์...", "normal");
    try {
        console.log("Checking cloud sync status for user:", state.userId);
        const doc = await db.collection("users").doc(state.userId).get();
        
        if (doc.exists) {
            const cloudData = doc.data();
            const cloudUpdatedAt = cloudData.updatedAt || 0;
            const localUpdatedAt = state.updatedAt || 0;
            
            if (cloudUpdatedAt > localUpdatedAt) {
                console.log("Cloud data is newer. Downloading...");
                const success = await loadDataFromFirebase(state.userId);
                if (success) {
                    showToast("ซิงค์ข้อมูลล่าสุดจากคลาวด์สำเร็จแล้วครับ ☁️", "success");
                    updateSyncStatus("ตรงกัน (ดาวน์โหลดข้อมูลใหม่แล้ว)", "success");
                } else {
                    updateSyncStatus("ดาวน์โหลดข้อมูลคลาวด์ล้มเหลว", "error");
                }
            } else if (localUpdatedAt > cloudUpdatedAt) {
                console.log("Local data is newer. Uploading...");
                await saveDataToFirebase();
            } else {
                console.log("Local and cloud data are in sync.");
                updateSyncStatus("ตรงกัน (ซิงค์ข้อมูลเรียบร้อย)", "success");
            }
        } else {
            // Document doesn't exist on Firestore yet, upload local data to initialize it
            console.log("Cloud profile not found. Initializing cloud document...");
            await saveDataToFirebase();
        }
    } catch (e) {
        console.error("Error during startup auto-sync:", e);
        updateSyncStatus("เกิดข้อผิดพลาด: " + e.message, "error");
    }
}
