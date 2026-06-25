document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const views = {
    auth: document.getElementById('view-auth'),
    home: document.getElementById('view-home'),
    conversation: document.getElementById('view-conversation')
  };
  
  // Auth Buttons
  const btnGoogle = document.getElementById('btn-google-login');
  const btnMoreOptions = document.getElementById('btn-more-options');
  const emailLoginPanel = document.getElementById('email-login-panel');
  
  // Home Buttons
  const btnStartConv = document.getElementById('btn-start-conv');
  const btnHeaderProfile = document.getElementById('btn-header-profile');
  const onboardingPrompt = document.getElementById('onboarding-prompt');
  const btnClosePrompt = document.getElementById('btn-close-prompt');
  const profileProgressBar = document.getElementById('profile-progress-bar');
  const profilePercentText = document.getElementById('profile-percent');
  const promptOptionPills = document.querySelectorAll('.prompt-option-pill');
  const headerAvatarImg = document.getElementById('header-avatar-img');

  // Bottom Tab Nav Elements
  const tabButtons = document.querySelectorAll('.tab-nav-btn');
  const tabContents = document.querySelectorAll('.home-tab-content');
  const homeTitle = document.getElementById('home-title');
  const homeSubtitle = document.getElementById('home-subtitle');
  
  // Profile Sheet Elements
  const profileSheet = document.getElementById('profile-sheet');
  const btnCloseSheet = document.getElementById('btn-close-sheet');
  const sheetOverlay = profileSheet.querySelector('.sheet-overlay');
  const autosavePill = document.getElementById('autosave-pill');
  const profileForm = document.getElementById('profile-form');
  const profileNameInput = document.getElementById('profile-name');
  const nativeLangSelect = document.getElementById('native-lang');
  const secondaryLangCheckboxes = document.querySelectorAll('input[name="secondary_langs"]');
  const voiceMicSelect = document.getElementById('voice-mic-select');
  const btnTestMic = document.getElementById('btn-test-mic');
  const micTestWave = document.getElementById('mic-test-wave');
  const prefDarkTheme = document.getElementById('pref-dark-theme');
  const prefAutoTrans = document.getElementById('pref-auto-trans');
  const prefHaptics = document.getElementById('pref-haptics');
  const prefVad = document.getElementById('pref-vad');
  const avatarPresets = document.querySelectorAll('.avatar-preset-item');
  const profileAvatarPreview = document.getElementById('profile-avatar-preview');
  
  // Conversation View Elements
  const btnConvBack = document.getElementById('btn-conv-back');
  const chatLog = document.getElementById('chat-log');
  const waveformContainer = document.getElementById('waveform-container');
  const btnMicToggle = document.getElementById('btn-mic-toggle');
  const micStatusLabel = document.getElementById('voice-status-label');
  
  // New Voice Orb & Keyboard elements
  const prefShowTranscripts = document.getElementById('pref-show-transcripts');
  const voiceCallOverlay = document.getElementById('voice-call-overlay');
  const subtitleReceived = document.getElementById('subtitle-received');
  const subtitleUser = document.getElementById('subtitle-user');
  const voiceOrbBubble = document.getElementById('voice-orb-bubble');
  
  const keyboardInputBar = document.getElementById('keyboard-input-bar');
  const keyboardTextInput = document.getElementById('keyboard-text-input');
  const btnSendText = document.getElementById('btn-send-text');
  const voiceControlsWrapper = document.getElementById('voice-controls-wrapper');
  
  const btnKeyboardToggle = document.getElementById('btn-keyboard-toggle');
  const keyboardToggleIcon = document.getElementById('keyboard-toggle-icon');
  
  let currentUser = {
    name: 'Amani User',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&h=150&q=80',
    nativeLang: 'en',
    secondaryLangs: ['es', 'ja'],
    micDevice: 'default',
    prefDarkTheme: false,
    prefAutoTrans: true,
    prefHaptics: true,
    prefVad: false,
    prefShowTranscripts: false, // Voice Mode by default
    micTested: false
  };

  let conversationTimeline = null;
  let isMicTesting = false;
  let isConvMicActive = true;
  let isKeyboardMode = false;

  // Initialize App
  loadProfileSettings();
  updateOnboardingProgress();

  /* ==========================================================================
     NAVIGATION & VIEW TRANSITIONS
     ========================================================================== */
  function navigateTo(viewName) {
    // Hide all views
    Object.keys(views).forEach(key => {
      views[key].classList.remove('active');
    });
    
    // Show target view
    setTimeout(() => {
      views[viewName].classList.add('active');
      
      // Hook specific screen triggers
      if (viewName === 'conversation') {
        updateConversationModeVisibility();
        resetKeyboardMode();
        startSimulatedConversation();
      } else {
        stopSimulatedConversation();
      }
    }, 150);
  }

  function updateConversationModeVisibility() {
    const showTrans = currentUser.prefShowTranscripts;
    if (showTrans) {
      chatLog.classList.remove('hidden');
      voiceCallOverlay.classList.add('hidden');
    } else {
      chatLog.classList.add('hidden');
      voiceCallOverlay.classList.remove('hidden');
    }
  }

  function resetKeyboardMode() {
    isKeyboardMode = false;
    if (keyboardInputBar) keyboardInputBar.classList.add('hidden');
    if (voiceControlsWrapper) voiceControlsWrapper.classList.remove('hidden');
    
    // Restore keyboard icon
    if (keyboardToggleIcon) {
      keyboardToggleIcon.innerHTML = `
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M7 8h10M7 12h10M10 16h4" />
      `;
    }
  }

  /* ==========================================================================
     AUTHENTICATION ACTIONS
     ========================================================================== */
  // Google sign in click
  btnGoogle.addEventListener('click', () => {
    const btnText = btnGoogle.querySelector('.btn-content');
    const spinner = btnGoogle.querySelector('.loader-spinner');
    
    // Loading transition state
    btnText.style.opacity = '0';
    spinner.classList.remove('hidden');
    btnGoogle.disabled = true;
    
    // Simulate fast Oauth handshakes (800ms)
    setTimeout(() => {
      // Revert button styling
      btnText.style.opacity = '1';
      spinner.classList.add('hidden');
      btnGoogle.disabled = false;
      
      // Go to home screen
      navigateTo('home');
    }, 850);
  });

  // More options expansion
  btnMoreOptions.addEventListener('click', () => {
    const isExpanded = emailLoginPanel.classList.contains('expanded');
    if (isExpanded) {
      emailLoginPanel.classList.remove('expanded');
      btnMoreOptions.textContent = 'More options';
    } else {
      emailLoginPanel.classList.add('expanded');
      btnMoreOptions.textContent = 'Fewer options';
    }
  });

  /* ==========================================================================
     HOME ACTIONS & PROGRESSIVE ONBOARDING
     ========================================================================== */
  // Start Conversation trigger
  btnStartConv.addEventListener('click', () => {
    const activePartnerName = document.getElementById('active-partner-name');
    const activePartnerAvatar = document.getElementById('active-partner-avatar');
    
    if (activePartnerName) activePartnerName.textContent = 'Unity Translation AI';
    if (activePartnerAvatar) activePartnerAvatar.src = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&h=150&q=80';
    
    navigateTo('conversation');
  });

  // Contact list card clicks
  const contactCards = document.querySelectorAll('.clickable-card');
  contactCards.forEach(card => {
    card.addEventListener('click', () => {
      const nameEl = card.querySelector('.conv-name');
      const imgEl = card.querySelector('.conv-avatar img');
      const groupAvatarEl = card.querySelector('.group-avatar');
      
      const activePartnerName = document.getElementById('active-partner-name');
      const activePartnerAvatar = document.getElementById('active-partner-avatar');
      const activePartnerStatus = document.getElementById('active-partner-status');
      
      if (nameEl && activePartnerName) {
        activePartnerName.textContent = nameEl.textContent;
      }
      
      if (activePartnerAvatar) {
        if (imgEl && imgEl.src) {
          activePartnerAvatar.src = imgEl.src;
          activePartnerAvatar.style.display = 'block';
        } else if (groupAvatarEl) {
          // If it's a group, clear or set to a placeholder
          activePartnerAvatar.src = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&h=150&q=80';
        }
      }
      
      if (activePartnerStatus) {
        activePartnerStatus.textContent = 'Connected 🟢';
      }
      
      navigateTo('conversation');
    });
  });

  // Back from Conversation to Home
  btnConvBack.addEventListener('click', () => {
    navigateTo('home');
  });

  // Header Avatar click (Opens Profile)
  btnHeaderProfile.addEventListener('click', () => {
    openProfileSheet();
  });

  // Close onboarding card prompt
  btnClosePrompt.addEventListener('click', (e) => {
    e.stopPropagation();
    onboardingPrompt.classList.add('hidden');
  });

  // Prompt options pill clicks
  promptOptionPills.forEach(pill => {
    pill.addEventListener('click', () => {
      const target = pill.getAttribute('data-target');
      openProfileSheet();
      
      // Scroll to specific section in profile
      setTimeout(() => {
        if (target === 'languages') {
          nativeLangSelect.focus();
          nativeLangSelect.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if (target === 'voice') {
          voiceMicSelect.focus();
          voiceMicSelect.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if (target === 'profile') {
          profileNameInput.focus();
          profileNameInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
    });
  });

  // Bottom Tab Navigation switching
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      
      // Update active button
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Update active content
      tabContents.forEach(content => {
        content.classList.remove('active');
        if (content.id === `tab-content-${targetTab}`) {
          content.classList.add('active');
        }
      });
      
      // Update header text based on tab
      if (targetTab === 'chats') {
        homeTitle.textContent = 'Chats';
        homeSubtitle.textContent = "You're ready to communicate instantly";
      } else if (targetTab === 'groups') {
        homeTitle.textContent = 'Groups';
        homeSubtitle.textContent = 'Multi-language group conversations';
      } else if (targetTab === 'calls') {
        homeTitle.textContent = 'Calls';
        homeSubtitle.textContent = 'Recent voice translation sessions';
      }
      
      // Optional: add a tiny haptic simulation
      if (currentUser.prefHaptics && window.navigator.vibrate) {
        window.navigator.vibrate(8);
      }
    });
  });

  /* ==========================================================================
     PROFILE BOTTOM SHEET LOGIC
     ========================================================================== */
  function openProfileSheet() {
    profileSheet.classList.add('active');
  }

  function closeProfileSheet() {
    profileSheet.classList.remove('active');
    updateOnboardingProgress();
  }

  btnCloseSheet.addEventListener('click', closeProfileSheet);
  sheetOverlay.addEventListener('click', closeProfileSheet);

  // Profile Avatar Presets Selection
  avatarPresets.forEach(preset => {
    preset.addEventListener('click', () => {
      avatarPresets.forEach(p => p.classList.remove('selected'));
      preset.classList.add('selected');
      
      const newAvatarUrl = preset.getAttribute('data-avatar');
      currentUser.avatar = newAvatarUrl;
      profileAvatarPreview.src = newAvatarUrl;
      if (headerAvatarImg) {
        headerAvatarImg.src = newAvatarUrl;
      }
      
      triggerAutoSave();
    });
  });

  // Theme applier helper
  function applyTheme(isDark) {
    if (isDark) {
      document.body.classList.remove('light-theme');
    } else {
      document.body.classList.add('light-theme');
    }
  }

  // Auto-save form event listeners
  const autoSaveInputs = [profileNameInput, nativeLangSelect, prefDarkTheme, prefAutoTrans, prefHaptics, prefVad, prefShowTranscripts, voiceMicSelect];
  autoSaveInputs.forEach(input => {
    input.addEventListener('change', () => {
      updateStateFromForm();
      triggerAutoSave();
    });
  });

  profileNameInput.addEventListener('input', () => {
    updateStateFromForm();
    // Use debounce for text input auto-save
    clearTimeout(window.saveTimeout);
    window.saveTimeout = setTimeout(() => {
      triggerAutoSave();
    }, 500);
  });

  secondaryLangCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      updateStateFromForm();
      triggerAutoSave();
    });
  });

  // Synchronize state from HTML inputs
  function updateStateFromForm() {
    currentUser.name = profileNameInput.value.trim() || 'Amani User';
    currentUser.nativeLang = nativeLangSelect.value;
    currentUser.micDevice = voiceMicSelect.value;
    currentUser.prefDarkTheme = prefDarkTheme.checked;
    currentUser.prefAutoTrans = prefAutoTrans.checked;
    currentUser.prefHaptics = prefHaptics.checked;
    currentUser.prefVad = prefVad.checked;
    currentUser.prefShowTranscripts = prefShowTranscripts.checked;
    
    applyTheme(currentUser.prefDarkTheme);
    updateConversationModeVisibility();
    
    // Secondary Languages array
    const selectedSecondary = [];
    secondaryLangCheckboxes.forEach(cb => {
      if (cb.checked) {
        selectedSecondary.push(cb.value);
      }
    });
    currentUser.secondaryLangs = selectedSecondary;
  }

  // Trigger simulated cloud & local storage save
  function triggerAutoSave() {
    autosavePill.classList.add('active', 'saving');
    autosavePill.querySelector('.save-text').textContent = 'Saving...';
    
    // Write state to LocalStorage
    localStorage.setItem('amani_profile_settings', JSON.stringify(currentUser));
    
    setTimeout(() => {
      autosavePill.classList.remove('saving');
      autosavePill.querySelector('.save-text').textContent = 'Saved';
      
      // Hide pill after short display
      setTimeout(() => {
        if (!autosavePill.classList.contains('saving')) {
          autosavePill.classList.remove('active');
        }
      }, 1500);
    }, 400);
  }

  // Load state from LocalStorage
  function loadProfileSettings() {
    const savedData = localStorage.getItem('amani_profile_settings');
    if (savedData) {
      try {
        currentUser = JSON.parse(savedData);
        
        // Populate inputs
        if (currentUser.prefDarkTheme !== undefined) {
          prefDarkTheme.checked = currentUser.prefDarkTheme;
        } else {
          currentUser.prefDarkTheme = false;
          prefDarkTheme.checked = false;
        }
        applyTheme(currentUser.prefDarkTheme);

        profileNameInput.value = currentUser.name;
        nativeLangSelect.value = currentUser.nativeLang;
        voiceMicSelect.value = currentUser.micDevice;
        prefAutoTrans.checked = currentUser.prefAutoTrans;
        prefHaptics.checked = currentUser.prefHaptics;
        prefVad.checked = currentUser.prefVad;
        
        if (currentUser.prefShowTranscripts !== undefined) {
          prefShowTranscripts.checked = currentUser.prefShowTranscripts;
        } else {
          currentUser.prefShowTranscripts = false;
          prefShowTranscripts.checked = false;
        }

        profileAvatarPreview.src = currentUser.avatar;
        if (headerAvatarImg) {
          headerAvatarImg.src = currentUser.avatar;
        }
        
        // Checkboxes
        secondaryLangCheckboxes.forEach(cb => {
          cb.checked = currentUser.secondaryLangs.includes(cb.value);
        });
        
        // Match avatar presets preview selection
        avatarPresets.forEach(preset => {
          if (preset.getAttribute('data-avatar') === currentUser.avatar) {
            preset.classList.add('selected');
          } else {
            preset.classList.remove('selected');
          }
        });
      } catch (e) {
        console.error('Error loading config', e);
      }
    }
  }
  // Calculate progressive onboarding percentage completion
  function updateOnboardingProgress() {
    let completedSteps = 0;
    const totalSteps = 6;
    
    // Check individual option completions
    const languagesCompleted = currentUser.secondaryLangs && currentUser.secondaryLangs.length > 0;
    const voiceCompleted = currentUser.micTested === true;
    const profileCompleted = currentUser.name && currentUser.name !== 'Amani User' && 
                             currentUser.avatar && !currentUser.avatar.includes('photo-1534528741775-53994a69daeb');
    
    if (currentUser.name && currentUser.name !== 'Amani User') completedSteps++;
    if (currentUser.avatar && !currentUser.avatar.includes('photo-1534528741775-53994a69daeb')) completedSteps++; // Image changed
    if (currentUser.nativeLang) completedSteps++;
    if (currentUser.secondaryLangs && currentUser.secondaryLangs.length > 0) completedSteps++;
    if (currentUser.micTested) completedSteps++;
    if (currentUser.prefVad) completedSteps++; // Activated a custom premium preference
    
    // Scale baseline to minimum of 20% to look active
    const pct = Math.min(100, Math.max(20, Math.round((completedSteps / totalSteps) * 100)));
    
    profilePercentText.textContent = `${pct}%`;
    profileProgressBar.style.width = `${pct}%`;
    
    // Smart Options checklist update: hide/style completed pills
    const langPill = document.querySelector('.prompt-option-pill[data-target="languages"]');
    const voicePill = document.querySelector('.prompt-option-pill[data-target="voice"]');
    const profilePill = document.querySelector('.prompt-option-pill[data-target="profile"]');
    
    if (langPill) {
      if (languagesCompleted) {
        langPill.classList.add('completed');
        langPill.innerHTML = `✓ Languages Added`;
        langPill.style.opacity = '0.5';
        langPill.style.pointerEvents = 'none';
      } else {
        langPill.classList.remove('completed');
        langPill.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="m5 8 6 6 6-6" />
          </svg>
          Add languages
        `;
        langPill.style.opacity = '1';
        langPill.style.pointerEvents = 'auto';
      }
    }
    
    if (voicePill) {
      if (voiceCompleted) {
        voicePill.classList.add('completed');
        voicePill.innerHTML = `✓ Voice Setup Completed`;
        voicePill.style.opacity = '0.5';
        voicePill.style.pointerEvents = 'none';
      } else {
        voicePill.classList.remove('completed');
        voicePill.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          </svg>
          Set up voice
        `;
        voicePill.style.opacity = '1';
        voicePill.style.pointerEvents = 'auto';
      }
    }
    
    if (profilePill) {
      if (profileCompleted) {
        profilePill.classList.add('completed');
        profilePill.innerHTML = `✓ Profile Completed`;
        profilePill.style.opacity = '0.5';
        profilePill.style.pointerEvents = 'none';
      } else {
        profilePill.classList.remove('completed');
        profilePill.innerHTML = `Complete profile`;
        profilePill.style.opacity = '1';
        profilePill.style.pointerEvents = 'auto';
      }
    }
    
    // Hide onboarding card if 100% complete
    if (pct >= 100) {
      setTimeout(() => {
        onboardingPrompt.classList.add('hidden');
      }, 1000);
    }
  }

  /* ==========================================================================
     MICROPHONE AUDIO TEST FUNCTION
     ========================================================================== */
  btnTestMic.addEventListener('click', () => {
    if (isMicTesting) {
      stopMicTest();
    } else {
      startMicTest();
    }
  });

  function startMicTest() {
    isMicTesting = true;
    btnTestMic.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
      Stop Testing
    `;
    btnTestMic.style.backgroundColor = 'var(--color-danger)';
    btnTestMic.style.color = 'white';
    micTestWave.classList.remove('hidden');
    micTestWave.classList.add('active');
    
    // Auto terminate test after 4 seconds
    window.micTestTimeout = setTimeout(() => {
      stopMicTest();
    }, 4000);
  }

  function stopMicTest() {
    isMicTesting = false;
    clearTimeout(window.micTestTimeout);
    
    btnTestMic.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
      Test Microphone
    `;
    btnTestMic.removeAttribute('style'); // Clear inline red styling
    micTestWave.classList.remove('active');
    micTestWave.classList.add('hidden');
    
    // Register microphone tested in state
    currentUser.micTested = true;
    localStorage.setItem('amani_profile_settings', JSON.stringify(currentUser));
    updateOnboardingProgress();
  }

  /* ==========================================================================
     CONVERSATION SCREEN TRANSLATION WORKSPACE
     ========================================================================== */
  // Toggle mic button in conversation view
  btnMicToggle.addEventListener('click', () => {
    isConvMicActive = !isConvMicActive;
    if (isConvMicActive) {
      btnMicToggle.classList.add('active');
      waveformContainer.classList.remove('hidden');
      if (micStatusLabel) micStatusLabel.textContent = 'Listening...';
      if (voiceOrbBubble) voiceOrbBubble.className = 'voice-orb-center listening';
    } else {
      btnMicToggle.classList.remove('active');
      waveformContainer.classList.add('hidden');
      if (micStatusLabel) micStatusLabel.textContent = 'Muted';
      if (voiceOrbBubble) voiceOrbBubble.className = 'voice-orb-center';
    }
  });

  // Simulated conversations script
  function startSimulatedConversation() {
    // Clear previous simulation if active
    stopSimulatedConversation();
    
    // Clear chat log (keep system message)
    chatLog.innerHTML = `
      <div class="chat-system-msg">
        <span>English ⇄ Spanish translation active</span>
      </div>
    `;
    
    // Reset subtitle labels
    if (subtitleReceived) subtitleReceived.textContent = 'Waiting for speech...';
    if (subtitleUser) subtitleUser.textContent = 'Tap mic to start talking';
    if (voiceOrbBubble) voiceOrbBubble.className = 'voice-orb-center';
    
    // Setup visualizers
    isConvMicActive = true;
    btnMicToggle.classList.add('active');
    waveformContainer.classList.remove('hidden');
    if (micStatusLabel) micStatusLabel.textContent = 'Listening...';
    
    // Create translation timeline elements
    const timeline = [
      {
        delay: 1500,
        sender: 'partner',
        avatar: '🇪🇸',
        text: 'Hola, ¡bienvenido! La traducción en tiempo real ya está funcionando.',
        origLang: 'Spanish (Original)',
        transText: 'Hello, welcome! The real-time translation is already working.',
        transLang: 'English (Translated)'
      },
      {
        delay: 5000,
        sender: 'user',
        avatar: '🇺🇸',
        text: 'That is incredible. The connection took less than a second.',
        origLang: 'English (Original)',
        transText: 'Eso es increíble. La conexión tardó menos de un segundo.',
        transLang: 'Spanish (Translated)'
      },
      {
        delay: 8500,
        sender: 'partner',
        avatar: '🇪🇸',
        text: '¡Exacto! El objetivo es comunicarse de inmediato sin barreras de idioma.',
        origLang: 'Spanish (Original)',
        transText: 'Exactly! The goal is to communicate immediately without language barriers.',
        transLang: 'English (Translated)'
      }
    ];

    conversationTimeline = [];

    timeline.forEach(item => {
      const timer = setTimeout(() => {
        if (!isConvMicActive && item.sender === 'user') {
          // If muted, delay user speech transcribe
          return;
        }
        
        // Update voice mode overlays
        if (item.sender === 'partner') {
          if (subtitleReceived) subtitleReceived.textContent = item.transText;
          if (voiceOrbBubble) {
            voiceOrbBubble.className = 'voice-orb-center speaking';
            setTimeout(() => {
              if (voiceOrbBubble.classList.contains('speaking')) {
                voiceOrbBubble.className = 'voice-orb-center';
              }
            }, 2800);
          }
        } else {
          if (subtitleUser) subtitleUser.textContent = item.text;
          if (voiceOrbBubble) {
            voiceOrbBubble.className = 'voice-orb-center listening';
            setTimeout(() => {
              if (voiceOrbBubble.classList.contains('listening')) {
                voiceOrbBubble.className = 'voice-orb-center';
              }
            }, 2000);
          }
        }
        
        appendBubble(item);
      }, item.delay);
      conversationTimeline.push(timer);
    });
  }

  function stopSimulatedConversation() {
    if (conversationTimeline) {
      conversationTimeline.forEach(timer => clearTimeout(timer));
      conversationTimeline = null;
    }
  }

  function getLangDetails(langCode) {
    const langs = {
      en: { name: 'English', flag: '🇺🇸', country: 'United States' },
      es: { name: 'Spanish', flag: '🇪🇸', country: 'Spain' },
      fr: { name: 'French', flag: '🇫🇷', country: 'France' },
      sw: { name: 'Swahili', flag: '🇰🇪', country: 'Kenya' },
      ja: { name: 'Japanese', flag: '🇯🇵', country: 'Japan' },
      de: { name: 'German', flag: '🇩🇪', country: 'Germany' },
      zh: { name: 'Chinese', flag: '🇨🇳', country: 'China' }
    };
    return langs[langCode] || { name: langCode, flag: '🌍', country: '' };
  }

  function getLangDetailsFromFlag(flag) {
    const flagMap = {
      '🇺🇸': { name: 'English', country: 'United States' },
      '🇪🇸': { name: 'Spanish', country: 'Spain' },
      '🇯🇵': { name: 'Japanese', country: 'Japan' },
      '🇰🇪': { name: 'Swahili', country: 'Kenya' },
      '🇫🇷': { name: 'French', country: 'France' },
      '🇩🇪': { name: 'German', country: 'Germany' },
      '🇨🇳': { name: 'Chinese', country: 'China' }
    };
    return flagMap[flag] || { name: 'Unknown', country: '' };
  }

  function appendBubble(data) {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${data.sender}`;
    
    let senderName = '';
    let langLabel = '';
    let flagEmoji = '';
    
    if (data.sender === 'user') {
      senderName = 'Me';
      const details = getLangDetails(currentUser.nativeLang);
      flagEmoji = details.flag;
      langLabel = `${flagEmoji} ${details.name} (${details.country})`;
    } else {
      const partnerNameEl = document.getElementById('active-partner-name');
      senderName = partnerNameEl ? partnerNameEl.textContent : 'Partner';
      
      const flag = data.avatar || '🌍';
      flagEmoji = flag;
      const details = getLangDetailsFromFlag(flag);
      langLabel = `${flag} ${details.name} (${details.country})`;
    }
    
    bubble.innerHTML = `
      <div class="bubble-avatar">${flagEmoji}</div>
      <div class="bubble-text-wrapper">
        <div class="bubble-header">
          <span class="bubble-sender-name">${senderName}</span>
          <span class="bubble-meta-info">${langLabel}</span>
        </div>
        <div class="bubble-body">
          <p class="bubble-text">${data.text}</p>
          <div class="translation-divider"></div>
          <p class="translated-text">${data.transText}</p>
        </div>
      </div>
    `;
    
    chatLog.appendChild(bubble);
    
    // Scroll to bottom of conversation window
    chatLog.scrollTo({
      top: chatLog.scrollHeight,
      behavior: 'smooth'
    });
  }

  // Keyboard Mode toggling
  if (btnKeyboardToggle) {
    btnKeyboardToggle.addEventListener('click', () => {
      isKeyboardMode = !isKeyboardMode;
      if (isKeyboardMode) {
        // Show keyboard typing bar
        keyboardInputBar.classList.remove('hidden');
        voiceControlsWrapper.classList.add('hidden');
        
        // Mute voice mic
        isConvMicActive = false;
        btnMicToggle.classList.remove('active');
        waveformContainer.classList.add('hidden');
        if (micStatusLabel) micStatusLabel.textContent = 'Muted';
        if (voiceOrbBubble) voiceOrbBubble.className = 'voice-orb-center';
        
        // Force show chat log and hide voice overlay in keyboard mode
        chatLog.classList.remove('hidden');
        voiceCallOverlay.classList.add('hidden');
        
        // Change keyboard button icon to microphone SVG so user can toggle back to voice
        keyboardToggleIcon.innerHTML = `
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          </svg>
        `;
        keyboardTextInput.focus();
      } else {
        // Show voice controls wrapper
        keyboardInputBar.classList.add('hidden');
        voiceControlsWrapper.classList.remove('hidden');
        
        // Activate microphone
        isConvMicActive = true;
        btnMicToggle.classList.add('active');
        waveformContainer.classList.remove('hidden');
        if (micStatusLabel) micStatusLabel.textContent = 'Listening...';
        if (voiceOrbBubble) voiceOrbBubble.className = 'voice-orb-center listening';
        
        // Restore keyboard SVG icon
        keyboardToggleIcon.innerHTML = `
          <rect x="3" y="4" width="18" height="12" rx="2" />
          <path d="M7 8h10M7 12h10M10 16h4" />
        `;
        
        // Restore mode visibility based on user preference
        updateConversationModeVisibility();
      }
    });
  }

  // Keyboard text sending handlers
  if (btnSendText) {
    btnSendText.addEventListener('click', sendTypedMessage);
  }
  if (keyboardTextInput) {
    keyboardTextInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        sendTypedMessage();
      }
    });
  }

  function sendTypedMessage() {
    const text = keyboardTextInput.value.trim();
    if (!text) return;
    
    // Clear input
    keyboardTextInput.value = '';
    
    // Update Subtitles (optimistic UI)
    if (subtitleUser) subtitleUser.textContent = text;
    if (subtitleReceived) subtitleReceived.textContent = 'Translating...';
    
    // Add to text transcript log if active
    const userMsg = {
      sender: 'user',
      avatar: '🇺🇸',
      text: text,
      origLang: 'English (Original)',
      transText: '...',
      transLang: 'Spanish (Translated)'
    };
    appendBubble(userMsg);
    
    // Simulate translation response after a short delay
    setTimeout(() => {
      const partnerReply = {
        sender: 'partner',
        avatar: '🇪🇸',
        text: 'Entendido. Mensaje recibido y traducido correctamente.',
        origLang: 'Spanish (Original)',
        transText: 'Understood. Message received and translated correctly.',
        transLang: 'English (Translated)'
      };
      
      if (subtitleReceived) subtitleReceived.textContent = partnerReply.transText;
      appendBubble(partnerReply);
      
      // Animate the voice mode bubble/orb (pulse as speaking)
      if (voiceOrbBubble) {
        voiceOrbBubble.className = 'voice-orb-center speaking';
        setTimeout(() => {
          if (voiceOrbBubble.classList.contains('speaking')) {
            voiceOrbBubble.className = 'voice-orb-center';
          }
        }, 1500);
      }
    }, 1200);
  }
});
