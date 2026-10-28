/**
 * AutoScribe - Admin & Teacher Management Script
 * Enables teachers to manage question banks, review submitted voice answers, and export final exam papers.
 */

document.addEventListener('DOMContentLoaded', () => {
  AutoScribeAdmin.init();
});

const AutoScribeAdmin = {
  async init() {
    this.renderSubmissions();
    this.setupForm();
  },

  async renderSubmissions() {
    const tableBody = document.getElementById('submissionsTableBody');
    if (!tableBody) return;

    const submissions = JSON.parse(localStorage.getItem('autoscribe_submissions') || '[]');

    const countMetric = document.getElementById('submissionCountMetric');
    if (countMetric) {
      countMetric.textContent = submissions.length;
    }

    if (submissions.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 3rem 1.5rem; color: var(--text-secondary); font-size: 1.1rem;"><span style="font-size: 2rem; display: block; margin-bottom: 0.5rem;" aria-hidden="true">📭</span>No student submissions recorded yet.<br><small style="font-size: 0.9rem;">Submissions from active student sessions will automatically appear here.</small></td></tr>`;
      return;
    }

    tableBody.innerHTML = submissions.map(sub => `
      <tr>
        <td><strong style="color: var(--accent-gold); font-family: 'JetBrains Mono', monospace; font-size: 0.95rem;">${sub.submissionId}</strong></td>
        <td>
          <div style="font-weight: 700; color: var(--text-primary); font-size: 1.05rem;">${sub.studentName}</div>
          <div style="font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.2rem;">Roll: ${sub.studentId || sub.studentRoll || 'N/A'}</div>
        </td>
        <td>
          <span style="display: inline-block; background: rgba(13, 148, 136, 0.15); border: 1px solid var(--primary-teal); color: #5eead4; font-size: 0.85rem; font-weight: 700; padding: 0.25rem 0.65rem; border-radius: 4px;">${sub.examId}</span>
        </td>
        <td style="color: var(--text-secondary); font-size: 0.95rem;">${new Date(sub.submittedAt).toLocaleString()}</td>
        <td style="text-align: right;">
          <button class="btn btn-secondary" onclick="AutoScribeAdmin.viewAnswers('${sub.submissionId}')" style="display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.5rem 1rem;">
            <span aria-hidden="true">👁️</span> Review Answers
          </button>
        </td>
      </tr>
    `).join('');
  },

  viewAnswers(submissionId) {
    const submissions = JSON.parse(localStorage.getItem('autoscribe_submissions') || '[]');
    const sub = submissions.find(s => s.submissionId === submissionId);
    if (!sub) return;

    let content = `EXAMINATION RESPONSE REPORT\n`;
    content += `===============================\n`;
    content += `Submission ID: ${sub.submissionId}\n`;
    content += `Student: ${sub.studentName} (${sub.studentId || sub.studentRoll || 'N/A'})\n`;
    content += `Exam ID: ${sub.examId}\n`;
    content += `Submitted At: ${sub.submittedAt}\n`;
    content += `===============================\n\n`;

    for (const [qId, ansText] of Object.entries(sub.answers || {})) {
      content += `Question ${qId}:\n`;
      content += `${ansText || '[No Answer Provided]'}\n`;
      content += `-------------------------------\n\n`;
    }

    const modal = document.createElement('div');
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(7, 13, 30, 0.88)';
    modal.style.backdropFilter = 'blur(6px)';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '1000';

    modal.innerHTML = `
      <div class="card" role="dialog" aria-modal="true" aria-labelledby="modalTitle" style="max-width: 760px; width: 92%; max-height: 85vh; overflow-y: auto; background: var(--bg-card); border: 2px solid var(--accent-gold); box-shadow: 0 20px 40px rgba(0,0,0,0.85);">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 1rem; margin-bottom: 1.5rem;">
          <h3 id="modalTitle" class="card-title" style="margin: 0; color: var(--accent-gold); font-size: 1.35rem;">Submission Details (${sub.studentName})</h3>
          <button class="btn btn-secondary" onclick="this.closest('.card').parentElement.remove()" aria-label="Close dialog" style="padding: 0.4rem 0.8rem;">✕ Close</button>
        </div>
        <pre style="background: var(--bg-secondary); padding: 1.5rem; border-radius: 8px; font-family: 'JetBrains Mono', monospace; white-space: pre-wrap; color: var(--text-primary); border: 1px solid var(--border-card); font-size: 0.95rem; line-height: 1.6;">${content}</pre>
        <div style="display: flex; gap: 1rem; margin-top: 1.5rem; justify-content: flex-end;">
          <button class="btn btn-primary" onclick="AutoScribeAdmin.downloadReport('${sub.submissionId}', \`${encodeURIComponent(content)}\`)">📥 Download Text Report</button>
          <button class="btn btn-secondary" onclick="this.closest('.card').parentElement.remove()">Dismiss</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  },

  downloadReport(submissionId, encodedContent) {
    const text = decodeURIComponent(encodedContent);
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AutoScribe_${submissionId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  },

  exportAllSubmissions() {
    const submissions = JSON.parse(localStorage.getItem('autoscribe_submissions') || '[]');
    if (submissions.length === 0) {
      alert("No student submissions recorded yet to export.");
      return;
    }
    const blob = new Blob([JSON.stringify(submissions, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AutoScribe_All_Submissions_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  setupForm() {
    const form = document.getElementById('createExamForm');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const title = document.getElementById('examTitle').value;
        const code = document.getElementById('examCode').value;
        const duration = parseInt(document.getElementById('examDuration').value);
        const q1 = document.getElementById('q1Text').value;

        const newExam = {
          id: 'exam_' + Date.now(),
          title,
          code,
          durationMinutes: duration,
          totalQuestions: 1,
          questions: [
            { id: 1, text: q1, marks: 10 }
          ]
        };

        const existingExams = JSON.parse(localStorage.getItem('autoscribe_exams') || '[]');
        existingExams.push(newExam);
        localStorage.setItem('autoscribe_exams', JSON.stringify(existingExams));

        alert("Exam created successfully!");
        form.reset();
      });
    }
  }
};
