import React from 'react';
import { useState } from 'react';
import './Home.css';
function HomePage() {
  const [formdata, setformdata] = useState({
    companyName: "",
    applyingAsA: "Experienced",
    jobDescription: "",
    currentResume: "",
    coverlettertone: "informal"
  })

  const[geminiResponse,setgeminiResponse]=useState("");
  const [geminiStructured, setGeminiStructured] = useState(null);
  
  // Parse the freeform gemini response into numbered sections (if available)
  function parseGeminiResponse(text) {
    if (!text) return [];
    const normalized = text.replace(/\r\n/g, '\n');

    // Find section headers like "1. Tailored Cover Letter" or "1) Title" or **1. Title**
    const headerRegex = /^\s*(?:\*\*)?\s*(\d+)[\.)]\s*([^*\n]+)(?:\*\*)?$/gm;
    const headers = [];
    let match;
    while ((match = headerRegex.exec(normalized)) !== null) {
      headers.push({ idx: match.index, num: match[1], title: match[2].trim(), len: match[0].length });
    }

    if (headers.length === 0) {
      // No numbered headers found - return entire text as a single block
      return [{ title: null, content: normalized.trim() }];
    }

    const sections = [];
    for (let i = 0; i < headers.length; i++) {
      const start = headers[i].idx + headers[i].len;
      const end = i + 1 < headers.length ? headers[i + 1].idx : normalized.length;
      let content = normalized.slice(start, end).trim();
      
      // Clean up markdown formatting
      content = content.replace(/\*\*/g, '');
      
      sections.push({ 
        title: `${headers[i].num}. ${headers[i].title}`, 
        content,
        type: headers[i].title.toLowerCase().includes('cover letter') ? 'cover_letter' :
              headers[i].title.toLowerCase().includes('resume') ? 'resume' :
              headers[i].title.toLowerCase().includes('keyword') ? 'keywords' :
              headers[i].title.toLowerCase().includes('ats') ? 'ats' : 'other'
      });
    }
    return sections;
  }

  // Render text with paragraphs: split on double newlines and preserve single-line breaks
  function renderParagraphs(text) {
    if (!text) return null;
    
    // Split text into sections, preserving important whitespace
    const paragraphs = text.split(/\n\n+/).map(para => {
      // Handle basic markdown-style formatting
      return para
        .trim()
        .split('\n')
        .map(line => line
          .replace(/\[([^\]]+)\]/g, '$1')           // Remove square brackets
          .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') // Convert **bold** to HTML
          .replace(/\*([^*]+)\*/g, '<em>$1</em>')   // Convert *italic* to HTML
          .trim()
        )
        .join('\n');
    }).filter(Boolean);

    return paragraphs.map((para, i) => (
      <p 
        key={i} 
        style={{ whiteSpace: 'pre-wrap', marginBottom: '0.75rem' }}
        dangerouslySetInnerHTML={{ __html: para }}
      />
    ));
  }

  // Convert parsed sections into a structured object for predictable rendering
  function structureGeminiResponse(text) {
    const sections = parseGeminiResponse(text || '');
    const result = {
      coverLetter: null,
      updatedResume: null,
      keywordAnalysis: { keywords: [], missing: [], present: [] },
      atsScore: null,
      otherSections: []
    };

    const extractBulletPoints = (text) => {
      if (!text) return [];
      
      // Split into lines and clean them
      const lines = text.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
      
      // Process each line
      const bullets = lines.map(line => {
        // Remove bullet points, numbers, and other markers
        return line.replace(/^[•\-\*\d.)\]]+\s*/, '')
          .replace(/^["']/, '')  // Remove starting quotes
          .replace(/["']$/, '')  // Remove ending quotes
          .replace(/^\s*Enthusiastic\s*$/, '') // Remove single word "Enthusiastic"
          .replace(/^Optimized Bullet Points.*:$/, '') // Remove section headers
          .replace(/^Professional\s+Summary\s*:?/, '') // Remove "Professional Summary:"
          .replace(/^Optimized\s+Summary\s*:?/, '') // Remove "Optimized Summary:"
          .trim();
      })
      .filter(line => 
        line.length > 10 && // Remove very short lines
        !line.toLowerCase().includes('professional summary') && // Remove section headers
        !line.toLowerCase().includes('key achievements') &&
        !line.toLowerCase().includes('qualifications')
      );

      // Join split sentences that might have been broken across bullets
      const mergedBullets = [];
      let currentBullet = '';

      bullets.forEach(bullet => {
        // If the previous bullet doesn't end with a period and this one starts with lowercase
        if (currentBullet && 
            !currentBullet.endsWith('.') && 
            bullet[0] === bullet[0].toLowerCase()) {
          currentBullet += ' ' + bullet;
        } else {
          if (currentBullet) mergedBullets.push(currentBullet);
          currentBullet = bullet;
        }
      });
      if (currentBullet) mergedBullets.push(currentBullet);

      return mergedBullets;
    };

    const cleanContent = (content) => {
      return content
        .replace(/\[([^\]]+)\]/g, '$1') // Remove square brackets
        .replace(/\*\*/g, '')           // Remove bold markers
        .replace(/^\s*```\s*|\s*```\s*$/g, '') // Remove code blocks
        .replace(/^["']|["']$/g, '')   // Remove surrounding quotes
        .trim();
    };

    for (const sec of sections) {
      const title = (sec.title || '').toLowerCase();
      const content = cleanContent(sec.content || '');

      switch(sec.type) {
        case 'cover_letter':
          result.coverLetter = content;
          break;

        case 'resume':
          // Split content into sections
          const sections = content.split(/(?:\n\n|\r\n\r\n)/).filter(Boolean);
          
          // Find the summary section
          let summary = '';
          const bulletPoints = [];
          
          sections.forEach(section => {
            const cleanSection = section.trim();
            if (cleanSection.toLowerCase().includes('professional summary') ||
                cleanSection.toLowerCase().includes('summary') ||
                !cleanSection.match(/^[•\-\*\d.)\]]/)) {
              // This is likely the summary section
              summary = cleanSection
                .replace(/^Professional\s+Summary\s*:?\s*/i, '')
                .replace(/^Optimized\s+Summary\s*:?\s*/i, '')
                .trim();
            } else {
              // This is likely a section with bullet points
              bulletPoints.push(...extractBulletPoints(cleanSection));
            }
          });

          result.updatedResume = { 
            raw: content,
            summary: summary || sections[0], // Use first section as summary if no explicit summary found
            bullets: bulletPoints.filter(b => b.length > 0)
          };
          break;

        case 'keywords':
          const lines = content.split(/\n+/).map(l => l.trim()).filter(Boolean);
          for (const line of lines) {
            const low = line.toLowerCase();
            if (low.includes('missing') || low.includes('lacking') || low.includes('add')) {
              result.keywordAnalysis.missing.push(...extractListFromText(line.replace(/.*?(?:missing|lacking|add)[:\-]?/i, '')));
            } else if (low.includes('present') || low.includes('found') || low.includes('exist') || low.includes('match')) {
              result.keywordAnalysis.present.push(...extractListFromText(line.replace(/.*?(?:present|found|existing|matching)[:\-]?/i, '')));
            } else {
              result.keywordAnalysis.keywords.push(...extractListFromText(line));
            }
          }
          // de-dupe and clean
          result.keywordAnalysis.keywords = Array.from(new Set(result.keywordAnalysis.keywords))
            .filter(k => k.length > 1);
          result.keywordAnalysis.missing = Array.from(new Set(result.keywordAnalysis.missing))
            .filter(k => k.length > 1);
          result.keywordAnalysis.present = Array.from(new Set(result.keywordAnalysis.present))
            .filter(k => k.length > 1);
          break;

        case 'ats':
          const scoreMatch = content.match(/(\d{1,3})(?:\s*%)?/);
          if (scoreMatch) {
            let score = parseInt(scoreMatch[1], 10);
            result.atsScore = Math.min(100, Math.max(0, score));
          }
          break;

        default:
          if (content.trim()) {
            result.otherSections.push({
              title: sec.title,
              content: cleanContent(content)
            });
          }
          break;
      }
    }

    return result;
  }
  // AIzaSyDvqRAD6HKnqHGBKKThoOifEh92jh49efs
  async function Handledata() {
    console.log(formdata);
    const prompt = ` You are a professional career coach and resume optimization expert. 
Your task is to generate a personalized cover letter, improve the resume content, 
and provide an ATS (Applicant Tracking System) analysis.

Inputs:
Company Name: ${formdata.companyName}
Experience Level: ${formdata.applyingAsA}  (Fresher / Experienced)
Job Description: ${formdata.jobDescription}
Current Resume: ${formdata.currentResume} (If empty, assume no resume exists and create a draft)
Preferred Tone: ${formdata.coverlettertone}

Output (format clearly in sections):

1. Tailored Cover Letter  
Write a professional cover letter addressed to ${formdata.companyName}.  
Use the specified tone: ${formdata.coverlettertone}.  
Highlight relevant skills and experiences based on the job description.  

2. Updated Resume Content  
Suggest optimized resume summary, bullet points, and skills tailored to ${formdata.jobDescription}.  
Ensure the content is concise, achievement-focused, and ATS-friendly.  

3. Keyword Match Analysis  
Extract the most important keywords from the job description.  
Check if they exist in the provided resume (if given).  
List missing keywords that should be added.  

4. ATS Score Estimate (0-100)  
Provide a rough ATS match score for the current resume against the job description.  
Explain the reasoning briefly (e.g., missing keywords, formatting issues, irrelevant content).  

Ensure the response is structured, clear, and easy to display in a React app. 
        `
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
    const options = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-goog-api-key': 'AIzaSyDvqRAD6HKnqHGBKKThoOifEh92jh49efs'
      },
      body: `{"contents":[{"parts":[{"text":"${prompt}"}]}]}`
    };

    try {
      const response = await fetch(url, options);
      const data = await response.json();
      const text = data.candidates[0].content.parts[0].text;
      console.log("Generated api data", text);
      setgeminiResponse(text);
      // store a structured representation for predictable rendering
      try {
        setGeminiStructured(structureGeminiResponse(text));
      } catch (e) {
        // fall back silently to raw text if structuring fails
        setGeminiStructured(null);
      }
    } catch (error) {
      console.error(error);
        setGeminiStructured(null);
    }
  }

  return (
    <div className="home-page">
      <h1 className="page-title">Cover Letter & Resume Assistant</h1>
      <div className="home-grid">
        <div className="form-panel">
          <form>
            <div className="form-group">
              <label htmlFor="companyName">Company Name</label>
              <input 
                type="text" 
                id="companyName"
                placeholder="Enter company name"
                value={formdata.companyName} 
                onChange={(e) => setformdata({ ...formdata, companyName: e.target.value })} 
              />
              <div className="small-note">Company you are applying to</div>
            </div>

            <div className="form-group">
              <label htmlFor="applyingAsA">Experience Level</label>
              <select
                id="applyingAsA"
                value={formdata.applyingAsA}
                onChange={(e) => setformdata({ ...formdata, applyingAsA: e.target.value })}
              >
                <option value="Fresher">Fresher</option>
                <option value="Experienced">Experienced</option>
              </select>
              <div className="small-note">Select your experience level</div>
            </div>

            <div className="form-group">
              <label htmlFor="jobDescription">Job Description</label>
              <textarea
                id="jobDescription"
                placeholder="Paste the job description here"
                rows="8"
                value={formdata.jobDescription}
                onChange={(e) => setformdata({ ...formdata, jobDescription: e.target.value })}
              ></textarea>
              <div className="small-note">Full job description helps improve matching</div>
            </div>

            <div className="form-group">
              <label htmlFor="currentResume">Current Resume</label>
              <textarea
                id="currentResume"
                placeholder="Paste your current resume content here"
                rows="8"
                value={formdata.currentResume}
                onChange={(e) => setformdata({ ...formdata, currentResume: e.target.value })}
              ></textarea>
              <div className="small-note">Your existing resume content for optimization</div>
            </div>

            <div className="form-group">
              <label htmlFor="coverlettertone">Cover Letter Tone</label>
              <select
                id="coverlettertone"
                value={formdata.coverlettertone}
                onChange={(e) => setformdata({ ...formdata, coverlettertone: e.target.value })}
              >
                <option value="Formal">Formal</option>
                <option value="informal">Informal</option>
                <option value="Casual">Casual</option>
              </select>
              <div className="small-note">Choose the writing style for your cover letter</div>
            </div>

            <button type="button" className="btn" onClick={Handledata}>
              Generate Cover Letter & Analysis
            </button>
          </form>
        </div>

        <div className="result-panel">
          <h1>Results</h1>
          {!geminiResponse && !geminiStructured && (
            <div className="muted">
              Fill in the form and click generate to create your customized cover letter and resume analysis
            </div>
          )}
          
          {(geminiStructured || geminiResponse) && (() => {
            const structured = geminiStructured || structureGeminiResponse(geminiResponse || '');
            return (
              <div className="result-card">
                {/* Cover Letter Section */}
                {structured.coverLetter && (
                  <section>
                    <h2>Cover Letter</h2>
                    <div className="section-meta">Professionally crafted for {formdata.companyName}</div>
                    <div className="content-box">
                      {renderParagraphs(structured.coverLetter)}
                    </div>
                  </section>
                )}

                {/* Resume Optimization Section */}
                {structured.updatedResume && (
                  <section>
                    <h2>Resume Optimization</h2>
                    <div className="section-meta">Enhanced content for ATS compatibility</div>
                    
                    <div className="content-box">
                      <strong>Professional Summary</strong>
                      {structured.updatedResume.summary ? (
                        renderParagraphs(structured.updatedResume.summary)
                      ) : (
                        <p className="muted">Summary not provided</p>
                      )}
                    </div>
                    
                    {structured.updatedResume.bullets?.length > 0 && (
                      <div className="content-box">
                        <strong>Key Achievements & Qualifications</strong>
                        <div className="resume-bullets">
                          {structured.updatedResume.bullets.map((bullet, idx) => (
                            <div key={idx} className="resume-bullet">
                              <span className="bullet-point">•</span>
                              <span className="bullet-content">{bullet}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </section>
                )}

                {/* Keyword Analysis Section */}
                {structured.keywordAnalysis && (
                  <section>
                    <h2>Keyword Analysis</h2>
                    <div className="section-meta">Job requirements and profile match</div>
                    
                    {structured.keywordAnalysis.keywords.length > 0 && (
                      <div className="keyword-section">
                        <strong>Key Job Requirements</strong>
                        <div className="keyword-list">
                          {structured.keywordAnalysis.keywords.map((keyword, idx) => (
                            <span key={idx} className="keyword-tag">{keyword}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="keyword-analysis-grid">
                      {structured.keywordAnalysis.present.length > 0 && (
                        <div className="keyword-section">
                          <strong>Matching Skills</strong>
                          <div className="keyword-list">
                            {structured.keywordAnalysis.present.map((keyword, idx) => (
                              <span key={idx} className="keyword-tag">{keyword}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {structured.keywordAnalysis.missing.length > 0 && (
                        <div className="keyword-section">
                          <strong>Skills to Highlight</strong>
                          <div className="keyword-list">
                            {structured.keywordAnalysis.missing.map((keyword, idx) => (
                              <span key={idx} className="keyword-tag">{keyword}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {/* ATS Score Section */}
                {structured.atsScore !== null && (
                  <section>
                    <h2>ATS Compatibility</h2>
                    <div className="section-meta">Profile match score</div>
                    <div className="ats-score">
                      <div className="score-value">{structured.atsScore}%</div>
                      <div className="score-bar">
                        <div 
                          className="score-fill"
                          style={{ width: `${structured.atsScore}%` }}
                        />
                      </div>
                      <div className="small-note">
                        {structured.atsScore >= 80 ? 'Excellent match!' :
                         structured.atsScore >= 60 ? 'Good match - consider adding missing keywords' :
                         'Consider updating your resume with the suggested keywords'}
                      </div>
                    </div>
                  </section>
                )}

                {/* Additional Information Section */}
                {structured.otherSections?.length > 0 && (
                  <section>
                    <h2>Additional Notes</h2>
                    {structured.otherSections.map((section, idx) => (
                      <div key={idx} className="content-box">
                        {section.title && <strong>{section.title}</strong>}
                        {renderParagraphs(section.content)}
                      </div>
                    ))}
                  </section>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
export default HomePage;