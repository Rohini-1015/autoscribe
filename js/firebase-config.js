/**
 * AutoScribe - Firebase & Database Integration Layer
 * Configures Firebase Auth & Firestore with seamless fallback to localStorage 
 * to ensure 100% reliability during offline college/school demonstrations.
 */

const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "autoscribe-exam-aid.firebaseapp.com",
  projectId: "autoscribe-exam-aid",
  storageBucket: "autoscribe-exam-aid.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abc123def456789"
};

window.AutoScribeDB = {
  isFirebaseAvailable: false,
  db: null,
  auth: null,

  init() {
    try {
      const isPlaceholder = !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith("YOUR_");
      
      if (!isPlaceholder && window.firebase && window.firebase.apps && window.firebase.apps.length === 0) {
        window.firebase.initializeApp(firebaseConfig);
        this.db = window.firebase.firestore();
        this.auth = window.firebase.auth();
        this.isFirebaseAvailable = true;
        console.log("AutoScribe: Connected to Live Firebase Backend.");
      } else {
        console.log("AutoScribe: Operating in Reliable LocalStorage Mode.");
        this.initMockDatabase();
      }
    } catch (e) {
      console.warn("AutoScribe: Firebase init failed. Using LocalStorage fallback.", e);
      this.initMockDatabase();
    }
  },

  initMockDatabase() {
    const sampleExams = [
      {
        id: "exam_math",
        title: "Mathematics",
        code: "",
        durationMinutes: 90,
        totalQuestions: 7,
        structure: "Part A: 5 Questions (2 Marks Each, No Options) | Part B: 2 Questions (10 Marks Each, No Options)",
        questions: [
          { id: 1, text: "Solve for x: 3x + 7 = 22.", marks: 2, section: "Part A (2 Marks)" },
          { id: 2, text: "Find the discriminant and nature of roots for the quadratic equation x^2 - 5x + 6 = 0.", marks: 2, section: "Part A (2 Marks)" },
          { id: 3, text: "State the Pythagorean Theorem and write its mathematical formula.", marks: 2, section: "Part A (2 Marks)" },
          { id: 4, text: "Find the area of a circle with radius 7 cm.", marks: 2, section: "Part A (2 Marks)" },
          { id: 5, text: "Evaluate sin 30 degrees + cos 60 degrees.", marks: 2, section: "Part A (2 Marks)" },
          { id: 6, text: "Prove that square root of 2 is an irrational number. State the Fundamental Theorem of Arithmetic and find the HCF and LCM of 96 and 404 using prime factorization.", marks: 10, section: "Part B (10 Marks)" },
          { id: 7, text: "State and prove Thales Theorem (Basic Proportionality Theorem). In triangle ABC, DE is parallel to BC with AD = 3 cm, DB = 5 cm, and AE = 4.5 cm. Calculate EC.", marks: 10, section: "Part B (10 Marks)" }
        ]
      },
      {
        id: "exam_phys",
        title: "Physics",
        code: "",
        durationMinutes: 90,
        totalQuestions: 7,
        structure: "Part A: 5 Questions (2 Marks Each, No Options) | Part B: 2 Questions (10 Marks Each, No Options)",
        questions: [
          { id: 1, text: "State Newton's Second Law of Motion and write its mathematical equation F = ma.", marks: 2, section: "Part A (2 Marks)" },
          { id: 2, text: "Define Electric Current and state its SI unit.", marks: 2, section: "Part A (2 Marks)" },
          { id: 3, text: "State Ohm's Law and write the relationship between Voltage V, Current I, and Resistance R.", marks: 2, section: "Part A (2 Marks)" },
          { id: 4, text: "Describe the optical ray diagram for a Convex Lens and state its focal length sign convention.", marks: 2, section: "Part A (2 Marks)" },
          { id: 5, text: "Define Work done by a force and write its SI unit (Joule).", marks: 2, section: "Part A (2 Marks)" },
          { id: 6, text: "State and derive the Lens Formula 1/f = 1/v - 1/u. Draw neat ray diagrams showing image formation by a concave mirror when an object is placed between F and C.", marks: 10, section: "Part B (10 Marks)" },
          { id: 7, text: "State Ohm's Law. Derive expressions for equivalent resistance when three resistors R1, R2, and R3 are connected in (a) Series and (b) Parallel.", marks: 10, section: "Part B (10 Marks)" }
        ]
      },
      {
        id: "exam_chem",
        title: "Chemistry",
        code: "",
        durationMinutes: 90,
        totalQuestions: 7,
        structure: "Part A: 5 Questions (2 Marks Each, No Options) | Part B: 2 Questions (10 Marks Each, No Options)",
        questions: [
          { id: 1, text: "Define pH and write the equation pH = -log[H+].", marks: 2, section: "Part A (2 Marks)" },
          { id: 2, text: "Balance the chemical equation: Fe + H2O -> Fe3O4 + H2.", marks: 2, section: "Part A (2 Marks)" },
          { id: 3, text: "State Avogadro's Law and define one Mole of a substance.", marks: 2, section: "Part A (2 Marks)" },
          { id: 4, text: "Define Oxidation and Reduction in terms of electron transfer.", marks: 2, section: "Part A (2 Marks)" },
          { id: 5, text: "Write the molecular formula and structural formula of Ethanoic Acid (CH3COOH).", marks: 2, section: "Part A (2 Marks)" },
          { id: 6, text: "Explain the metallurgical extraction of Iron from Haematite ore using a Blast Furnace with chemical equations for reactions occurring in different temperature zones.", marks: 10, section: "Part B (10 Marks)" },
          { id: 7, text: "Discuss Covalent Bonding in Carbon compounds. Explain Tetravalency and Catenation. Describe the preparation, properties, and chemical reactions of Ethanol.", marks: 10, section: "Part B (10 Marks)" }
        ]
      },
      {
        id: "exam_cs",
        title: "Computer Science",
        code: "",
        durationMinutes: 90,
        totalQuestions: 7,
        structure: "Part A: 5 Questions (2 Marks Each, No Options) | Part B: 2 Questions (10 Marks Each, No Options)",
        questions: [
          { id: 1, text: "What is a Variable in programming and state two naming rules?", marks: 2, section: "Part A (2 Marks)" },
          { id: 2, text: "Differentiate between Compiler and Interpreter.", marks: 2, section: "Part A (2 Marks)" },
          { id: 3, text: "What is an Array and how is its zero-based index represented?", marks: 2, section: "Part A (2 Marks)" },
          { id: 4, text: "Define the term 'Algorithm' in problem solving.", marks: 2, section: "Part A (2 Marks)" },
          { id: 5, text: "What is the difference between == and = operators in programming?", marks: 2, section: "Part A (2 Marks)" },
          { id: 6, text: "Explain Object-Oriented Programming (OOP) principles: Encapsulation, Inheritance, Polymorphism, and Abstraction with clear code examples.", marks: 10, section: "Part B (10 Marks)" },
          { id: 7, text: "Describe linear search and binary search algorithms. Write code or pseudocode for Binary Search and analyze their time complexities O(n) and O(log n).", marks: 10, section: "Part B (10 Marks)" }
        ]
      },
      {
        id: "exam_bio",
        title: "Biology",
        code: "",
        durationMinutes: 90,
        totalQuestions: 7,
        structure: "Part A: 5 Questions (2 Marks Each, No Options) | Part B: 2 Questions (10 Marks Each, No Options)",
        questions: [
          { id: 1, text: "Define Photosynthesis and write its overall chemical equation.", marks: 2, section: "Part A (2 Marks)" },
          { id: 2, text: "What is the role of Stomata in plant leaves during gas exchange?", marks: 2, section: "Part A (2 Marks)" },
          { id: 3, text: "Differentiate between Arteries and Veins in the human circulatory system.", marks: 2, section: "Part A (2 Marks)" },
          { id: 4, text: "Define Reflex Arc and give one daily life example.", marks: 2, section: "Part A (2 Marks)" },
          { id: 5, text: "What is DNA and where is it located inside a eukaryotic cell?", marks: 2, section: "Part A (2 Marks)" },
          { id: 6, text: "Describe the anatomical structure and working diagram of the Human Heart. Explain double circulation (Systemic and Pulmonary circulation) in detail.", marks: 10, section: "Part B (10 Marks)" },
          { id: 7, text: "Explain Human Digestive System organs and process. Trace the path of food from mouth to small intestine, stating digestive enzymes involved for carbohydrates, proteins, and fats.", marks: 10, section: "Part B (10 Marks)" }
        ]
      },
      {
        id: "exam_eng",
        title: "English",
        code: "",
        durationMinutes: 90,
        totalQuestions: 7,
        structure: "Part A: 5 Questions (2 Marks Each, No Options) | Part B: 2 Questions (10 Marks Each, No Options)",
        questions: [
          { id: 1, text: "Define Active Voice and Passive Voice with an example sentence for each.", marks: 2, section: "Part A (2 Marks)" },
          { id: 2, text: "Correct the sentence: 'Neither of the two students are present today.'", marks: 2, section: "Part A (2 Marks)" },
          { id: 3, text: "What is a Simile? Give a suitable sentence example.", marks: 2, section: "Part A (2 Marks)" },
          { id: 4, text: "Define Precis writing and mention two key rules of summary writing.", marks: 2, section: "Part A (2 Marks)" },
          { id: 5, text: "Identify the noun and adjective in: 'The courageous firefighter saved the family.'", marks: 2, section: "Part A (2 Marks)" },
          { id: 6, text: "Write a formal essay (approx 250 words) on 'The Importance of Digital Literacy and AI in Modern School Education'.", marks: 10, section: "Part B (10 Marks)" },
          { id: 7, text: "Write a formal application letter to the School Principal requesting permission and audio-visual facilities to organize a Science & Assistive Technology Exhibition.", marks: 10, section: "Part B (10 Marks)" }
        ]
      }
    ];

    const currentExams = JSON.parse(localStorage.getItem('autoscribe_exams') || '[]');
    // Refresh local storage if outdated, missing subjects, or any subject questions count is not 7
    const isValid = Array.isArray(currentExams) && 
      currentExams.length === 6 && 
      currentExams.every(e => e && e.id && Array.isArray(e.questions) && e.questions.length === 7);

    if (!isValid) {
      localStorage.setItem('autoscribe_exams', JSON.stringify(sampleExams));
    }

    if (!localStorage.getItem('autoscribe_submissions')) {
      localStorage.setItem('autoscribe_submissions', JSON.stringify([]));
    }
  },

  async getExams() {
    this.initMockDatabase();
    if (this.isFirebaseAvailable) {
      try {
        const snapshot = await this.db.collection('exams').get();
        if (!snapshot.empty) {
          const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          if (Array.isArray(docs) && docs.length === 6 && docs.every(d => d.questions && d.questions.length === 7)) {
            return docs;
          }
        }
      } catch (e) {
        console.warn("Firebase getExams failed, using local storage:", e);
      }
    }
    let exams = JSON.parse(localStorage.getItem('autoscribe_exams') || '[]');
    const isValid = Array.isArray(exams) && 
      exams.length === 6 && 
      exams.every(e => e && e.id && Array.isArray(e.questions) && e.questions.length === 7);

    if (!isValid) {
      localStorage.removeItem('autoscribe_exams');
      this.initMockDatabase();
      exams = JSON.parse(localStorage.getItem('autoscribe_exams') || '[]');
    }
    return exams;
  },

  async saveAnswer(studentId, examId, questionId, answerText) {
    const key = `autoscribe_ans_${studentId}_${examId}_q${questionId}`;
    localStorage.setItem(key, answerText);

    if (this.isFirebaseAvailable) {
      try {
        await this.db.collection('answers').doc(`${studentId}_${examId}_q${questionId}`).set({
          studentId,
          examId,
          questionId,
          answerText,
          updatedAt: new Date().toISOString()
        });
      } catch (e) {
        console.warn("Firebase saveAnswer failed, local copy saved:", e);
      }
    }
  },

  async submitExam(studentId, studentName, examId, answers) {
    const submission = {
      submissionId: 'SUB-' + Date.now(),
      studentId,
      studentName,
      examId,
      answers,
      submittedAt: new Date().toISOString(),
      status: "Submitted"
    };

    // Always guarantee local storage persistence
    const existing = JSON.parse(localStorage.getItem('autoscribe_submissions') || '[]');
    existing.push(submission);
    localStorage.setItem('autoscribe_submissions', JSON.stringify(existing));

    if (this.isFirebaseAvailable) {
      try {
        await this.db.collection('submissions').add(submission);
      } catch (e) {
        console.warn("Firebase submission sync warning (saved locally):", e);
      }
    }
    return submission;
  }
};

window.AutoScribeDB.init();
