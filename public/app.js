(() => {
  'use strict';
  const C = window.MINDCRAFT_CONTENT;
  const STORE = 'mindcraft-data-v1';
  const $ = (selector, root = document) => root.querySelector(selector);
  const root = $('#view-root');
  const dateKey = date => {
    const d = date || new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const defaultData = () => ({ onboardingComplete:false, goal:'', baseline:null, attempts:[], sessions:[], completedDates:[], streak:0, maxStreak:0 });
  let data;
  try { data = { ...defaultData(), ...JSON.parse(localStorage.getItem(STORE) || '{}') }; }
  catch { data = defaultData(); }
  let activeView = 'home';
  let selectedGoal = data.goal || '';
  let practice = null;
  let baselineIndex = 0;
  let baselineCorrect = 0;
  let practiceTimer = null;
  let deferredInstall = null;
  let waitingWorker = null;

  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(data)); }
    catch { toast('This device could not save your progress. Check browser storage settings.'); }
    updateStreak();
    $('#streak-value').textContent = data.streak || 0;
  }
  function updateStreak() {
    const days = [...new Set(data.completedDates || [])].sort();
    let best = 0, run = 0, prev = null;
    for (const key of days) {
      const day = new Date(`${key}T12:00:00`);
      const serial = Math.floor(day.getTime() / 86400000);
      run = prev !== null && serial - prev === 1 ? run + 1 : 1;
      best = Math.max(best, run); prev = serial;
    }
    data.maxStreak = Math.max(data.maxStreak || 0, best);
    const today = dateKey();
    const yesterday = dateKey(new Date(Date.now() - 86400000));
    if (days.includes(today)) data.streak = bestCurrentRun(days, today);
    else if (days.includes(yesterday)) data.streak = bestCurrentRun(days, yesterday);
    else data.streak = 0;
  }
  function bestCurrentRun(days, from) {
    let count = 0, current = new Date(`${from}T12:00:00`);
    const set = new Set(days);
    while (set.has(dateKey(current))) { count++; current.setDate(current.getDate() - 1); }
    return count;
  }
  function averageFor(track) {
    const attempts = data.attempts.filter(a => a.track === track).slice(-3);
    return attempts.length ? Math.round(100 * attempts.filter(a => a.correct).length / attempts.length) : 0;
  }
  function trackAttemptCount(track) { return data.attempts.filter(a => a.track === track).length; }
  function trackLevel(track) { return Math.min(3, 1 + Math.floor(trackAttemptCount(track) / 3)); }
  function todayComplete() { return (data.completedDates || []).includes(dateKey()); }
  function todaySession() { return [...data.sessions].reverse().find(s => s.date === dateKey()); }
  function fmtDate(d = new Date()) { return d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' }); }
  function toast(message) {
    const node = document.createElement('div'); node.className = 'toast'; node.textContent = message;
    $('#toast-region').append(node); window.setTimeout(() => node.remove(), 3700);
  }
  function setView(name) {
    activeView = name; practice = null;
    if (practiceTimer) clearInterval(practiceTimer);
    render(); window.scrollTo({ top:0, behavior:'smooth' });
  }
  function syncNav() {
    document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === activeView));
    const labels = {home:'DAILY INTELLIGENCE PRACTICE',practice:'TODAY’S FIELD SESSION',curriculum:'YOUR SKILL PATHS',progress:'YOUR TRAINING RECORD',fieldguide:'FIELD GUIDE & PRINCIPLES'};
    $('#top-context').textContent = labels[activeView] || labels.home;
    document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-current', button.dataset.view === activeView ? 'page' : 'false'));
  }
  function render() {
    if (practiceTimer) { clearInterval(practiceTimer); practiceTimer = null; }
    syncNav();
    $('#today-date').textContent = fmtDate();
    $('#streak-value').textContent = data.streak || 0;
    if (activeView === 'baseline') root.innerHTML = renderBaseline();
    else if (activeView === 'practice' && practice) root.innerHTML = renderPractice();
    else if (activeView === 'curriculum') root.innerHTML = renderCurriculum();
    else if (activeView === 'progress') root.innerHTML = renderProgress();
    else if (activeView === 'fieldguide') root.innerHTML = renderFieldGuide();
    else if (activeView === 'track') root.innerHTML = renderTrackDetail();
    else if (activeView === 'practice') root.innerHTML = renderPracticeLanding();
    else root.innerHTML = renderHome();
    bindView();
    root.focus({ preventScroll:true });
  }
  function renderHome() {
    const complete = todayComplete();
    const total = data.attempts.length;
    const correct = data.attempts.filter(a => a.correct).length;
    const overall = total ? Math.round(correct / total * 100) : 0;
    const tracks = C.tracks;
    const weekly = data.sessions.filter(s => Date.now() - new Date(`${s.date}T12:00:00`).getTime() < 7 * 86400000).length;
    const trackRows = tracks.slice(0, 4).map(t => {
      const attempts = trackAttemptCount(t.id), score = averageFor(t.id);
      return `<div class="skill-line"><span>${escapeHtml(t.name)}</span><div class="bar"><i style="width:${attempts ? score : 0}%"></i></div><strong>${attempts ? `${score}%` : '—'}</strong></div>`;
    }).join('');
    return `<section class="welcome-row"><div><div class="section-kicker">${data.onboardingComplete ? 'YOUR PRACTICE, CONTINUED' : 'A PRACTICE IN CLEAR THINKING'}</div><h1>Read carefully.<br>Conclude cautiously.</h1><p class="intro">${data.onboardingComplete ? 'A little deliberate practice beats a confident first impression.' : 'Train attention, evidence, and judgment—not mind-reading.'}</p></div><div class="issue-stamp">FIELD JOURNAL<strong>ISSUE ${String(Math.max(1,data.sessions.length + 1)).padStart(2,'0')} / MINDCRAFT</strong></div></section>
      <div class="home-grid"><section class="daily-card"><div class="daily-card-top"><span class="daily-label">TODAY’S FIELD SESSION</span><span class="day-counter">${complete ? 'COMPLETE FOR TODAY' : '5 SHORT ROUNDS'}</span></div><h2>${complete ? 'Well observed.' : 'Train your first impression to wait.'}</h2><p>${complete ? 'Your daily practice is in the record. Revisit the set or take a moment to review what you learned.' : 'Five quick challenges in attention, psychology, evidence, interviewing, and strategy. Notice first; test your explanation second.'}</p><div class="daily-card-bottom"><span class="session-meta">${complete ? 'TODAY’S SESSION LOGGED' : 'ABOUT 6–8 MINUTES · SAVED ON THIS DEVICE'}</span><button class="primary-button" data-action="start-daily">${complete ? 'Review today’s set' : 'Begin today’s practice'} <span aria-hidden="true">→</span></button></div></section>
      <section class="snapshot-card"><div class="snapshot-head"><h3>Skill snapshot</h3><span class="mini-orbit" aria-hidden="true">✳</span></div><p>${total ? `${total} responses · ${overall}% correct overall` : 'Your practice begins with one question.'}</p><div class="skill-mini">${trackRows}</div></section></div>
      <div class="under-row">${!data.onboardingComplete ? `<section class="baseline-banner"><div><h3>Set your starting point</h3><p>A quick, low-stakes baseline helps tune your practice. It’s a learning snapshot, not a diagnosis.</p></div><button class="quiet-button" data-action="baseline">Take baseline · 2 min</button></section>` : `<section class="baseline-banner"><div><h3>What would you like to sharpen?</h3><p>${escapeHtml(data.goal || 'Your program adapts gently to recent results and under-practised skills.')}</p></div><button class="quiet-button" data-view="curriculum">Explore skill paths →</button></section>`}<aside class="insight-card"><div class="section-kicker">A PRINCIPLE TO CARRY</div><p>“A cue is a question to explore, not an answer to announce.”</p></aside></div>
      <div class="lower-grid"><section><div class="section-title-row"><h3 class="card-heading">Your practice paths</h3><button class="text-link" data-view="curriculum">Full curriculum →</button></div><div class="track-preview-list">${tracks.slice(0,3).map(t=>`<button class="track-preview" data-track="${t.id}"><span class="track-badge">${t.code}</span><span><strong>${escapeHtml(t.name)}</strong><small>${escapeHtml(t.subtitle)}</small></span><span class="arrow">↗</span></button>`).join('')}</div></section><aside class="principle-card"><div class="section-kicker">THE MINDCRAFT METHOD</div><blockquote>Notice <span>what happened.</span><br>Test <span>what it might mean.</span></blockquote><p>Behavior is shaped by context, culture, and circumstance. Look for corroboration, welcome correction, and say how sure you are.</p></aside></div>`;
  }
  function renderPracticeLanding() {
    const complete = todayComplete();
    return `<div class="practice-layout"><div class="page-heading"><div class="section-kicker">FIELD SESSION · ${escapeHtml(fmtDate()).toUpperCase()}</div><h1>${complete ? 'Practice, at your own pace.' : 'Five rounds. One sharper habit.'}</h1><p>Short, varied scenarios across your skill paths. Every answer comes with the reasoning—and another plausible explanation to keep in view.</p></div><div class="panel-card"><div class="section-kicker">TODAY’S PLAN</div><h3>Observe → consider → check</h3><p>Five rounds · around 6–8 minutes. This device stores your answers locally. Your daily session counts once toward your streak; repeat practice is always welcome.</p><div class="lesson-action"><button class="primary-button" data-action="start-daily">${complete ? 'Review today’s practice' : 'Start daily session'} →</button> <button class="quiet-button" data-action="baseline">${data.baseline ? 'Retake baseline' : 'Set a baseline'}</button></div></div><div class="lesson-card"><div class="lesson-meta">TRAINING PROMISE</div><h3>No tells. No mind-reading.</h3><p>We will practice clear observations, open questions, and careful evidence evaluation. A pause, glance, or gesture is never treated as proof of honesty, intent, or guilt.</p></div></div>`;
  }
  function currentChoice(track, day) {
    const choices = C.exercises.filter(item => item.track === track);
    if (choices.length <= 1) return choices[0];
    const score = averageFor(track), tries = trackAttemptCount(track), level = trackLevel(track);
    let preferred = level >= 3 && score >= 67 ? 3 : level >= 2 && score >= 60 ? 2 : 1;
    if (tries >= 2 && score < 55) preferred = 1;
    const matched = choices.filter(item => item.difficulty <= preferred);
    const pool = matched.length ? matched : choices;
    return pool[Math.abs(day + (tries >= 2 && score < 55 ? 0 : 1)) % pool.length];
  }
  function dailyQueue() {
    const day = Math.floor(new Date(`${dateKey()}T12:00:00`).getTime() / 86400000);
    return C.tracks.map(track => ({ track, exercise:currentChoice(track.id,day) }))
      .sort((a,b) => (trackAttemptCount(a.track.id) ? averageFor(a.track.id) : 50) - (trackAttemptCount(b.track.id) ? averageFor(b.track.id) : 50) || trackAttemptCount(a.track.id) - trackAttemptCount(b.track.id))
      .map(entry => entry.exercise);
  }
  function beginDaily() {
    const saved = todaySession();
    const queue = saved?.exerciseIds?.length ? saved.exerciseIds.map(id => C.exercises.find(e => e.id === id)).filter(Boolean) : dailyQueue();
    practice = { mode:'daily', queue, index:0, state:queue[0]?.observe ? 'observe' : 'question', startedAt:Date.now(), correct:0, answered:0, choice:null, seconds:12, completedBefore:todayComplete() };
    activeView = 'practice'; render();
  }
  function beginTrack(id) {
    const day = Math.floor(new Date(`${dateKey()}T12:00:00`).getTime() / 86400000);
    practice = { mode:'track', queue:[currentChoice(id,day)], index:0, state:currentChoice(id,day).observe ? 'observe' : 'question', startedAt:Date.now(), correct:0, answered:0, choice:null, seconds:12 };
    activeView = 'practice'; render();
  }
  function renderPractice() {
    if (!practice || !practice.queue.length) return renderPracticeLanding();
    if (practice.state === 'done') return renderCompletion();
    const exercise = practice.queue[practice.index];
    const progress = Math.round(practice.index / practice.queue.length * 100);
    const track = C.tracks.find(t => t.id === exercise.track);
    let content = '';
    if (practice.state === 'observe') {
      content = `<div class="exercise-card"><div class="exercise-top"><span class="tag">${escapeHtml(track.name.toUpperCase())}</span><span class="round-label">ROUND ${practice.index+1} / ${practice.queue.length}</span></div><div class="lesson-meta">${escapeHtml(exercise.format.toUpperCase())}</div><h2>${escapeHtml(exercise.title)}</h2><div class="observe-panel"><h3>Read this scene with care</h3><p>${escapeHtml(exercise.observe)}</p></div><p class="question-prompt">You’ll answer from the details you noticed. Ready to begin?</p><div class="exercise-controls"><small>You may end the observation early.</small><button class="primary-button" data-action="observe-start">Start 12-second observation →</button></div></div>`;
    } else if (practice.state === 'countdown') {
      content = `<div class="exercise-card"><div class="exercise-top"><span class="tag">ATTENTION · RECALL</span><span class="round-label">ROUND ${practice.index+1} / ${practice.queue.length}</span></div><h2>Take in the scene.</h2><p class="scenario">${escapeHtml(exercise.observe)}</p><div class="observe-timer" id="timer-display">${practice.seconds} seconds</div><p class="exercise-controls"><small>Let your attention rest on concrete details.</small><button class="quiet-button" data-action="end-observe">I’m ready now</button></p></div>`;
    } else {
      const selected = practice.choice;
      content = `<div class="exercise-card"><div class="exercise-top"><span class="tag">${escapeHtml(track.name.toUpperCase())}</span><span class="round-label">ROUND ${practice.index+1} / ${practice.queue.length}</span></div><div class="lesson-meta">${escapeHtml(exercise.format.toUpperCase())} · LEVEL ${exercise.difficulty}</div><h2>${escapeHtml(exercise.title)}</h2>${exercise.scenario ? `<p class="scenario">${escapeHtml(exercise.scenario)}</p>` : ''}<p class="question-prompt">${escapeHtml(exercise.prompt)}</p><div class="answer-list">${exercise.options.map((option,i)=>`<button class="answer-option ${selected === i ? (option[1]?'correct':'incorrect') : ''}" data-answer="${i}" ${selected !== null ? 'disabled' : ''}><span class="answer-letter">${String.fromCharCode(65+i)}</span><span>${escapeHtml(option[0])}</span></button>`).join('')}</div>${selected !== null ? `<div class="feedback-panel ${exercise.options[selected][1]?'':'incorrect-feedback'}"><h3>${exercise.options[selected][1]?'Well reasoned.':'A useful correction.'}</h3><p>${escapeHtml(exercise.explanation)}</p><div class="feedback-label">OBSERVATION</div><p>${escapeHtml(exercise.observation)}</p><div class="feedback-label">INFERENCE TO HOLD LIGHTLY</div><p>${escapeHtml(exercise.inference)}</p><div class="feedback-label">ANOTHER PLAUSIBLE EXPLANATION</div><p>${escapeHtml(exercise.alternative)}</p></div><div class="exercise-controls"><small>${exercise.options[selected][1]?'Reasoning logged.':'Learning is the point; your first guess is only a starting point.'}</small><button class="primary-button" data-action="next">${practice.index === practice.queue.length-1 ? 'Finish session' : 'Next round'} →</button></div>` : `<div class="exercise-controls"><small>${exercise.observe?'Scene recalled.':'Choose the strongest evidence-based response.'}</small><span class="round-label">ONE BEST NEXT STEP</span></div>`}</div>`;
    }
    return `<div class="practice-layout"><div class="page-heading"><div class="section-kicker">${practice.mode === 'daily' ? 'DAILY FIELD SESSION' : 'FOCUSED SKILL PRACTICE'}</div><h1>${practice.state === 'done' ? 'Practice complete.' : 'Stay curious.'}</h1></div><div class="practice-progress"><div class="bar"><i style="width:${progress}%"></i></div><span>${practice.index+1} of ${practice.queue.length}</span></div>${content}</div>`;
  }
  function startObservation() {
    practice.state = 'countdown'; practice.seconds = 12; render();
    practiceTimer = setInterval(() => {
      if (!practice || practice.state !== 'countdown') return clearInterval(practiceTimer);
      practice.seconds--;
      const display = $('#timer-display'); if (display) display.textContent = `${Math.max(0,practice.seconds)} seconds`;
      if (practice.seconds <= 0) { clearInterval(practiceTimer); practiceTimer = null; practice.state = 'question'; render(); }
    }, 1000);
  }
  function endObservation() { if (practiceTimer) clearInterval(practiceTimer); practiceTimer = null; practice.state = 'question'; render(); }
  function submitAnswer(index) {
    if (!practice || practice.choice !== null) return;
    const exercise = practice.queue[practice.index], correct = !!exercise.options[index]?.[1];
    practice.choice = index; practice.answered++; if (correct) practice.correct++;
    data.attempts.push({ id:exercise.id, track:exercise.track, correct, date:dateKey(), timestamp:Date.now(), mode:practice.mode });
    save(); render();
  }
  function nextExercise() {
    if (!practice) return;
    if (practice.index + 1 < practice.queue.length) {
      practice.index++; practice.choice = null;
      practice.state = practice.queue[practice.index].observe ? 'observe' : 'question'; render();
    } else finishPractice();
  }
  function finishPractice() {
    if (practice.mode === 'daily') {
      const key = dateKey();
      const accuracy = Math.round(practice.correct / Math.max(1,practice.answered) * 100);
      if (!data.completedDates.includes(key)) {
        data.completedDates.push(key);
        data.sessions.push({ date:key, timestamp:Date.now(), correct:practice.correct, total:practice.answered, exerciseIds:practice.queue.map(e=>e.id), accuracy, repeats:0 });
      } else {
        const original = todaySession();
        if (original) { original.repeats = (original.repeats || 0) + 1; original.lastRepeatAccuracy = accuracy; original.repeatTimestamp = Date.now(); }
      }
      data.onboardingComplete = true; save();
    }
    practice.state = 'done'; render();
  }
  function renderCompletion() {
    const percent = Math.round(practice.correct / Math.max(1,practice.answered) * 100);
    const trackNames = [...new Set(practice.queue.map(e => C.tracks.find(t=>t.id===e.track)?.name).filter(Boolean))];
    return `<div class="practice-layout"><div class="exercise-card completion-card"><div class="completion-seal">✳</div><div class="section-kicker">${practice.mode==='daily'?(practice.completedBefore?'REPEAT PRACTICE COMPLETE':'TODAY’S SESSION LOGGED'):'PRACTICE COMPLETE'}</div><h2>Good work, careful observer.</h2><p>You practiced making room between what you noticed and what you concluded. Keep the alternative explanations in view.</p><div class="completion-score">${percent}% <span style="font:11px var(--mono);color:#79857c">· ${practice.correct} of ${practice.answered}</span></div><div class="recap-row">${trackNames.map(name=>`<span class="recap-chip">${escapeHtml(name)}</span>`).join('')}</div><button class="primary-button" data-action="home">Return to overview →</button></div></div>`;
  }
  function renderBaseline() {
    if (data.baseline && baselineIndex === -1) return `<div class="practice-layout"><div class="page-heading"><div class="section-kicker">YOUR STARTING POINT</div><h1>Baseline snapshot</h1><p>A small learning check—not a clinical or professional assessment.</p></div><div class="panel-card"><h3>${escapeHtml(data.baseline.recommendation)}</h3><p>Your snapshot: ${data.baseline.score}% across three foundational questions. ${escapeHtml(data.baseline.note)}</p><div class="lesson-action"><button class="primary-button" data-action="baseline-restart">Retake baseline →</button> <button class="quiet-button" data-action="home">Back to overview</button></div></div></div>`;
    const item = C.baseline[baselineIndex];
    if (!item) return `<div class="practice-layout"><div class="page-heading"><div class="section-kicker">STARTING POINT</div><h1>What do you notice?</h1><p>Choose the most grounded answer. This is a low-stakes baseline, not a test of who you are.</p></div><div class="exercise-card"><div class="section-kicker">QUESTION ${baselineIndex+1} OF ${C.baseline.length}</div><p class="question-prompt">${escapeHtml(item.prompt)}</p><div class="answer-list">${item.options.map((opt,i)=>`<button class="answer-option" data-baseline-answer="${i}"><span class="answer-letter">${String.fromCharCode(65+i)}</span><span>${escapeHtml(opt[0])}</span></button>`).join('')}</div></div></div>`;
    return `<div class="practice-layout"><div class="page-heading"><div class="section-kicker">A TWO-MINUTE STARTING POINT</div><h1>Set your baseline.</h1><p>This check-in helps you begin at a comfortable pace. It is not a diagnosis or a measure of anyone’s honesty-reading ability.</p></div>${baselineIndex===0 ? `<div class="panel-card"><div class="section-kicker">WHAT WOULD YOU LIKE TO SHARPEN?</div><h3>Choose a practice intention</h3><div class="goal-grid">${[['attention','Attention & recall','Notice more before deciding.'],['evidence','Evidence & reasoning','Weigh information fairly.'],['conversation','Listening & strategy','Ask better questions and plan clearly.']].map(([key,label,desc])=>`<button class="goal-option ${selectedGoal===key?'selected':''}" data-goal="${key}"><strong>${label}</strong><small>${desc}</small></button>`).join('')}</div></div>`:''}<div class="practice-progress"><div class="bar"><i style="width:${baselineIndex/C.baseline.length*100}%"></i></div><span>${baselineIndex+1} / ${C.baseline.length}</span></div><div class="exercise-card"><div class="section-kicker">QUESTION ${baselineIndex+1} OF ${C.baseline.length}</div><p class="question-prompt">${escapeHtml(item.prompt)}</p><div class="answer-list">${item.options.map((opt,i)=>`<button class="answer-option" data-baseline-answer="${i}"><span class="answer-letter">${String.fromCharCode(65+i)}</span><span>${escapeHtml(opt[0])}</span></button>`).join('')}</div></div></div>`;
  }
  function chooseBaseline(index) {
    if (!C.baseline[baselineIndex]) return;
    if (C.baseline[baselineIndex].options[index][1]) baselineCorrect++;
    baselineIndex++;
    if (baselineIndex >= C.baseline.length) {
      const score = Math.round(baselineCorrect / C.baseline.length * 100);
      const recommendation = score >= 67 ? 'Start with mixed practice' : 'Start with foundations';
      data.baseline = { score, date:dateKey(), recommendation, note:score >= 67 ? 'Your first step is varied scenarios with a reminder to check alternatives.' : 'Your first step is attention and fact-versus-inference practice.' };
      data.goal = selectedGoal; data.onboardingComplete = true; save(); baselineIndex = -1;
    }
    render();
  }
  function renderCurriculum() {
    return `<div class="page-heading-row"><div class="page-heading"><div class="section-kicker">FIVE PATHS · THREE LEVELS EACH</div><h1>Build the habits in order.</h1><p>Start with foundational skills, then raise the challenge as you practice. The program adapts to recent answers and gives every skill area regular attention.</p></div><button class="quiet-button" data-action="baseline">${data.baseline?'View baseline':'Take baseline'} →</button></div><div class="course-list">${C.tracks.map(track=>{
      const attempts=trackAttemptCount(track.id),level=trackLevel(track.id),score=averageFor(track.id),stageProgress=level===3?100:(attempts%3)/3*100,unlock=attempts===0?'Available · Level 1':`Level ${level} · ${attempts} practice ${attempts===1?'round':'rounds'}`,prerequisite=level===1?'Level 1 is open to all':`Level ${level} prerequisite: complete Level ${level-1} (${(level-1)*3} rounds)`,milestone=level===3?'All three levels complete':`${Math.max(0,level*3-attempts)} rounds to Level ${level+1}`;
      return `<article class="course-card"><div class="course-main"><span class="track-badge">${track.code}</span><div class="course-copy"><h3>${escapeHtml(track.name)}</h3><p>${escapeHtml(track.subtitle)} · ${escapeHtml(track.description)}</p></div><div class="course-stats"><strong>${unlock}</strong>${attempts?`${score}% recent accuracy`:'Start at Level 1'}</div></div><div class="level-track"><i style="width:${stageProgress}%"></i></div><div class="level-steps">${[1,2,3].map(n=>`<span><i class="step-dot ${n<level?'done':n===level?'current':''}"></i>Level ${n}${n===1?' · Notice':n===2?' · Test':' · Transfer'}</span>`).join('')}</div><div class="course-footer"><span class="prereq">${escapeHtml(prerequisite)} · ${escapeHtml(milestone)}</span><button data-track="${track.id}">Open learning path →</button></div></article>`;
    }).join('')}</div><div class="ethics-banner"><strong>Practice is not profiling.</strong><p>These modules build observation and reasoning—not a way to infer guilt, diagnose people, or reliably detect lies. Stay within consent, fairness, and the limits of the evidence.</p></div>`;
  }
  function renderTrackDetail() {
    const track=C.tracks.find(t=>t.id===window.currentTrack) || C.tracks[0];
    const level=trackLevel(track.id),lesson=track.lessons[level-1] || track.lessons[0];
    const attempts=trackAttemptCount(track.id),remaining=level===3?0:Math.max(0,level*3-attempts);
    return `<div class="practice-layout"><button class="text-link" data-view="curriculum">← All skill paths</button><div class="detail-hero"><div class="section-kicker">SKILL PATH ${track.code} · LEVEL ${level}</div><h2>${escapeHtml(track.name)}</h2><p>${escapeHtml(track.description)}</p></div><div class="lesson-card"><div class="lesson-meta">LEVEL ${level} · ${level===1?'NOTICE':level===2?'TEST':'TRANSFER'}</div><h3>${escapeHtml(lesson[0])}</h3><p>${escapeHtml(lesson[1])}</p><div class="lesson-action"><button class="primary-button" data-action="track-practice" data-track-id="${track.id}">Practice this skill →</button></div></div><div class="panel-card"><div class="section-kicker">YOUR NEXT MILESTONE</div><h3>${level===3?'All three levels complete':`${remaining} more ${remaining===1?'round':'rounds'} to reach Level ${level+1}`}</h3><p>Level 1 is open to everyone. Complete three practice rounds to reach Level 2 and six rounds in total to reach Level 3. Challenge difficulty also adapts to your recent answers. Advancement reflects practice volume, not a psychological or investigative credential.</p></div></div>`;
  }
  function renderProgress() {
    const total=data.attempts.length, correct=data.attempts.filter(a=>a.correct).length, accuracy=total?Math.round(correct/total*100):0;
    const sessions=[...data.sessions].reverse().slice(0,8);
    const week=Array.from({length:7},(_,i)=>{const day=new Date();day.setDate(day.getDate()-(6-i));const key=dateKey(day);return {key,label:day.toLocaleDateString('en-US',{weekday:'short'}).slice(0,1),count:data.sessions.filter(s=>s.date===key).length};});
    const max=Math.max(1,...week.map(x=>x.count));
    return `<div class="page-heading"><div class="section-kicker">PROGRESS, NOT PERFECTION</div><h1>Your field record.</h1><p>Scores show exercise answers, not a judgment of character or real-world skill. Look for patterns; one result is just one data point.</p></div><div class="stats-grid"><div class="stat-card"><span>Practice days</span><strong>${data.sessions.length}</strong><small>distinct daily practices completed</small></div><div class="stat-card"><span>Responses</span><strong>${total}</strong><small>across all skill paths</small></div><div class="stat-card"><span>Accuracy</span><strong>${total?`${accuracy}%`:'—'}</strong><small>correct exercise answers</small></div><div class="stat-card"><span>Best streak</span><strong>${data.maxStreak||0}</strong><small>consecutive practice days</small></div></div><div class="progress-columns"><section class="panel-card"><div class="section-kicker">SKILL-AREA TRENDS</div><h3>Room to grow</h3><p>Scores are shown only after practice—an empty bar means “not yet measured,” not zero skill.</p><div class="trend-list">${C.tracks.map(t=>{const n=trackAttemptCount(t.id),s=averageFor(t.id);return `<div class="trend-row"><span>${escapeHtml(t.name)}</span><div class="bar"><i style="width:${n?s:0}%"></i></div><strong>${n?`${s}%`:'—'}</strong></div>`}).join('')}</div></section><section class="panel-card"><div class="section-kicker">LAST SEVEN DAYS</div><h3>Practice rhythm</h3><p>Showing daily practice days, not time spent.</p><div class="chart-bars">${week.map(d=>`<div class="chart-column"><i style="height:${d.count?Math.max(9,d.count/max*100):3}%"></i><small>${d.label}</small></div>`).join('')}</div></section></div><section class="panel-card"><div class="section-kicker">RECENT HISTORY</div><h3>Session notes</h3>${sessions.length?`<div class="history-list">${sessions.map(s=>`<div class="history-row"><div><strong>${escapeHtml(new Date(`${s.date}T12:00:00`).toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'}))}</strong><small>${s.total} exercises · ${s.correct} grounded answers${s.repeats?` · ${s.repeats} repeat ${s.repeats===1?'run':'runs'}`:''}</small></div><span class="history-score">${s.accuracy}%</span></div>`).join('')}</div>`:`<div class="empty-state">Your first completed daily session will appear here. Progress stays on this browser and device.</div>`}</section>`;
  }
  function renderFieldGuide() {
    return `<div class="page-heading"><div class="section-kicker">A PRACTICE WITH GUARDRAILS</div><h1>Field guide for clear thinking.</h1><p>Use these habits to understand situations better—not to label, pressure, or secretly test people.</p></div><div class="ethics-banner"><strong>The central rule: people are not puzzles to solve.</strong><p>Be transparent about your purpose, respect privacy and consent, do not manipulate or provoke, and accept “I don’t know” as a responsible conclusion. This practice does not teach forensic procedure or replace professional training.</p></div><div class="guide-grid"><article class="guide-card"><span class="guide-index">01 / NOTICE</span><h3>Observation vs. inference</h3><p>Write what a camera could capture first: words, timing, position, and actions. Then label your explanation as a hypothesis. Keep the two in separate sentences.</p></article><article class="guide-card"><span class="guide-index">02 / CALIBRATE</span><h3>Behavior is not a lie detector</h3><p>Eye contact, fidgeting, pauses, posture, and vocal shifts vary with context and individuals. None proves honesty, intent, guilt, or a mental-health condition.</p></article><article class="guide-card"><span class="guide-index">03 / CHECK</span><h3>Look for alternatives</h3><p>Before settling on a story, list another explanation and ask what independent evidence would distinguish them. Give disconfirming information a fair hearing.</p></article><article class="guide-card"><span class="guide-index">04 / ASK</span><h3>Invite, don’t steer</h3><p>Open prompts—“What happened next?” or “What do you remember about that?”—are more respectful than questions that embed an assumed answer. Reflect back to check understanding.</p></article><article class="guide-card"><span class="guide-index">05 / WEIGH</span><h3>Track the source</h3><p>For a claim, note who or what produced it, when, how directly, and what might be missing. An investigative lead is a prompt for a fair check, not a finding of responsibility.</p></article><article class="guide-card"><span class="guide-index">06 / PLAN</span><h3>Choose a safe next step</h3><p>Clarify your goal and constraints. When facts are thin, prefer low-risk, reversible steps that improve information and protect people from avoidable harm.</p></article></div><section class="panel-card" style="margin-top:16px"><div class="section-kicker">YOUR DATA</div><h3>Local by design</h3><p>Your scores, streaks, and baseline are saved in this browser’s local storage. They do not sync between devices. Clearing browser data or using another browser may remove them.</p><div class="lesson-action"><button class="reset-link" data-action="reset-data">Clear all training data on this device</button></div></section>`;
  }
  function bindView() {
    root.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>setView(btn.dataset.view)));
    root.querySelectorAll('[data-action]').forEach(btn=>btn.addEventListener('click',()=>{
      const action=btn.dataset.action;
      if(action==='start-daily') beginDaily();
      if(action==='baseline'){baselineIndex=0;baselineCorrect=0;activeView='baseline';render();}
      if(action==='baseline-restart'){baselineIndex=0;baselineCorrect=0;activeView='baseline';render();}
      if(action==='observe-start') startObservation();
      if(action==='end-observe') endObservation();
      if(action==='next') nextExercise();
      if(action==='home') setView('home');
      if(action==='track-practice') beginTrack(btn.dataset.trackId);
      if(action==='reset-data') { if(confirm('Clear all Mindcraft training data saved on this device? This cannot be undone.')) { localStorage.removeItem(STORE);data=defaultData();selectedGoal='';baselineIndex=0;baselineCorrect=0;setView('home');toast('Local training data cleared.'); } }
    }));
    root.querySelectorAll('[data-answer]').forEach(btn=>btn.addEventListener('click',()=>submitAnswer(Number(btn.dataset.answer))));
    root.querySelectorAll('[data-baseline-answer]').forEach(btn=>btn.addEventListener('click',()=>chooseBaseline(Number(btn.dataset.baselineAnswer))));
    root.querySelectorAll('[data-goal]').forEach(btn=>btn.addEventListener('click',()=>{selectedGoal=btn.dataset.goal;render();}));
    root.querySelectorAll('[data-track]').forEach(btn=>btn.addEventListener('click',()=>{window.currentTrack=btn.dataset.track;activeView='track';render();}));
  }
  function updateConnectivity() { $('#offline-banner').hidden = navigator.onLine; }
  function setUpPwa() {
    window.addEventListener('online',updateConnectivity); window.addEventListener('offline',updateConnectivity); updateConnectivity();
    window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstall=event;$('#install-button').hidden=false;});
    window.addEventListener('appinstalled',()=>{deferredInstall=null;$('#install-button').hidden=true;toast('Mindcraft is installed on this device.');});
    $('#install-button').addEventListener('click',async()=>{if(!deferredInstall)return;deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;$('#install-button').hidden=true;});
    $('#install-help').addEventListener('click',()=>toast('Install from your browser menu: choose “Install app” or “Add to Home Screen.” A secure connection is required.'));
    $('#update-now').addEventListener('click',()=>{if(waitingWorker)waitingWorker.postMessage('SKIP_WAITING');else location.reload();});
    $('#dismiss-update').addEventListener('click',()=>$('#update-prompt').hidden=true);
    if('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('/sw.js').then(reg=>{
        if(reg.waiting) showUpdate(reg.waiting);
        reg.addEventListener('updatefound',()=>{const worker=reg.installing;if(!worker)return;worker.addEventListener('statechange',()=>{if(worker.state==='installed' && navigator.serviceWorker.controller)showUpdate(worker);});});
      }).catch(()=>toast('Offline storage is unavailable in this browser; you can still use the app online.'));
      navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload());
    }
  }
  function showUpdate(worker) { waitingWorker=worker;$('#update-prompt').hidden=false; }
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-view]');
    if(button && !root.contains(button) && button.dataset.view) setView(button.dataset.view);
  });
  updateStreak(); save(); setUpPwa(); render();
})();
