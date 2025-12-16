// --- 全域變數設定 ---
let player;
let questioners = [];
let hintGiver;
let gameState = 'playing'; // 'playing', 'questioning', 'attacking', 'finished', 'hintSelecting', 'hintMessage'
let score = 0;
let messageText = '';
let messageTimer = 0;

// UI 介面相關變數
let dialogOverlay; // 提問者對話框遮罩
let dialogBox;
let dialogQuestionText;
let dialogInputEl;
let dialogSubmitEl;
let dialogCloseEl;
// dialogHintEl (尋求幫助按鈕) 已被移除
let currentHintDisplay; // 原用於在提問框內顯示提示文字 (此處保留但將永遠隱藏)

// 幫助者 UI 介面 
let hintSelectOverlay;
let hintSelectBox;
let hintOptionsContainer; 
let hintAnswerDisplay;
let hintLeaveButton; 

// 幫助系統變數
let helpCount = 3; // 最多三次幫助
let hintPanel; // 左下角幫助次數面板
let hintPanelText;
// questionHintGiven 追蹤機制已不再需要，但為避免報錯，暫時保留定義
let questionHintGiven = {}; 

// 遊戲參數
const GLOBAL_SCALE = 1.6; 
const DEFAULT_ANIM_SPEED = 0.15; 
const PROXIMITY_ANIM_SPEED = 0.18; 
const CHAR_SIZE = 64 * GLOBAL_SCALE;
const EDGE_MARGIN_X = CHAR_SIZE / 2 + 100;
const EDGE_MARGIN_Y = CHAR_SIZE / 2 + 30;
const QUESTION_TRIGGER_DISTANCE = 150; 
const HINT_TRIGGER_DISTANCE = 150; // 觸發幫助者
const TEMPORARY_DISABLE_FRAMES = 120; // 120 幀約 2 秒，用於放棄/離開時的冷卻

// 題庫資料 (重要：移除 hint 屬性)
const quizBank = [
    { id: 1, question: "水的化學式是什麼？", answer: "H2O" },
    { id: 2, question: "世界最高的山峰是？", answer: "聖母峰" },
    { id: 3, question: "一公尺等於幾公分？", answer: "100" },
    { id: 4, question: "動漫《七龍珠》主角的名字是？", answer: "悟空" },
    { id: 5, question: "台灣的首都是？", answer: "台北" },
    { id: 6, question: "電腦記憶體簡稱？", answer: "RAM" },
    { id: 7, question: "圓周率近似值？", answer: "3.14" },
    { id: 8, question: "哪種金屬能導電？", answer: "銅" },
    { id: 9, question: "地球繞太陽一圈約幾天？領先", answer: "365" },
];

let usedQuestionIds = [];
let currentQuestion = null;
let currentQuestioner = null;

// --- 類別定義 (保持不變) ---

class Character {
    constructor(x, y, name) {
        this.x = x;
        this.y = y;
        this.size = CHAR_SIZE;
        this.name = name;
        this.currentFrame = 0;
        this.currentAction = 'Idle';
        this.animationSpeed = DEFAULT_ANIM_SPEED;
        this.facing = 'right'; 
        this.frames = {}; 
    }

    setFrames(framesObj) {
        this.frames = framesObj || {};
    }

    setAction(action) {
        if (!this.frames || !this.frames[action] || this.frames[action].length === 0) return;
        if (this.currentAction !== action) {
            this.currentAction = action;
            this.currentFrame = 0;
        }
    }

    draw() {
        if (this.frames && this.frames[this.currentAction] && this.frames[this.currentAction].length > 0) {
            const imgs = this.frames[this.currentAction];
            const idx = floor(this.currentFrame) % imgs.length;
            const imgToDraw = imgs[idx];

            if (imgToDraw) {
                push();
                translate(this.x, 0); 
                if (this.facing === 'left') {
                    scale(-1, 1);
                    image(imgToDraw, -this.size / 2, this.y - this.size / 2, this.size, this.size);
                } else {
                    image(imgToDraw, -this.size / 2, this.y - this.size / 2, this.size, this.size);
                }
                pop();
            }

            if (this.animationSpeed > 0) {
                this.currentFrame += this.animationSpeed;
                if (this.currentFrame >= imgs.length) this.currentFrame = 0;
            }
        } else {
            fill(150);
            rect(this.x - this.size/2, this.y - this.size/2, this.size, this.size);
        }
        
        fill(0);
        noStroke();
        textSize(14);
        textAlign(CENTER, CENTER);
        text(this.name.split(' ')[0], this.x, this.y + this.size / 2 + 15); 
    }

    checkCollision(other, triggerDistance) {
        let d = dist(this.x, this.y, other.x, other.y);
        return d < triggerDistance;
    }
}

class Player extends Character {
    constructor(x, y) {
        super(x, y, '玩家'); 
        this.speed = 4;
        this.isAttacking = false;
        this.attackTimer = 0;
    }

    move() {
        if (gameState === 'playing' || gameState === 'attacking') {
            let isMoving = false;
            
            if (player.isAttacking || gameState === 'questioning' || gameState === 'hintSelecting' || gameState === 'hintMessage') {
                isMoving = false; 
            } else if (gameState === 'playing') {
                if (keyIsDown(LEFT_ARROW)) { this.x -= this.speed; this.facing = 'left'; isMoving = true; }
                if (keyIsDown(RIGHT_ARROW)) { this.x += this.speed; this.facing = 'right'; isMoving = true; }
                if (keyIsDown(UP_ARROW)) { this.y -= this.speed; isMoving = true; }
                if (keyIsDown(DOWN_ARROW)) { this.y += this.speed; isMoving = true; }
            }

            // 動畫狀態切換
            if (this.isAttacking) {
                this.setAction('Attack');
                this.animationSpeed = DEFAULT_ANIM_SPEED * 1.5;
            } else if (isMoving) {
                this.setAction('Walk');
                this.animationSpeed = DEFAULT_ANIM_SPEED;
            } else {
                this.setAction('Idle');
                this.animationSpeed = DEFAULT_ANIM_SPEED;
            }

            // 邊界限制
            this.x = constrain(this.x, CHAR_SIZE/2, width - CHAR_SIZE/2);
            this.y = constrain(this.y, CHAR_SIZE/2, height - CHAR_SIZE/2);
        } else {
            // 提問中/選題中/訊息中：強制靜止，且動畫停止
            this.setAction('Idle');
            this.animationSpeed = 0; 
        }
    }
}

class Questioner extends Character {
    constructor(x, y, id) {
        super(x, y, `提問者${id}`);
        this.questionsAnswered = 0;
        this.maxQuestions = 2;
        this.availableQuestionIds = [];
        this.finished = false;
        this.isInProximity = false;
        this.disableTimer = 0; // 新增：用於放棄/離開時的冷卻計時器
    }

    setupQuestions(allQuestions) {
        let pool = allQuestions.filter(q => q.id % 3 === (parseInt(this.name.slice(-1)) - 1));
        let allUsedIds = questioners.flatMap(q => q.availableQuestionIds);
        let supplementPool = allQuestions.filter(q => !allUsedIds.includes(q.id));
        
        while (this.availableQuestionIds.length < 3 && pool.length > 0) {
            const randomIndex = floor(random(pool.length));
            this.availableQuestionIds.push(pool.splice(randomIndex, 1)[0].id);
        }
        while (this.availableQuestionIds.length < 3 && supplementPool.length > 0) {
            const randomIndex = floor(random(supplementPool.length));
            const qId = supplementPool.splice(randomIndex, 1)[0].id;
            if (!this.availableQuestionIds.includes(qId)) this.availableQuestionIds.push(qId);
        }
    }

    updateProximity(isNear) {
        // 在 questioning 狀態下或冷卻中，不允許切換動畫，保持靜止
        if (gameState === 'questioning' || this.finished || this.disableTimer > 0) return; 

        if (isNear) {
            this.facing = (player.x < this.x) ? 'right' : 'left';
            if (!this.isInProximity) {
                const action = (this.frames['Ask'] && this.frames['Ask'].length > 0) ? 'Ask' : 'Idle';
                this.setAction(action);
                this.animationSpeed = (action === 'Ask') ? PROXIMITY_ANIM_SPEED : DEFAULT_ANIM_SPEED;
                this.isInProximity = true;
            }
        } else if (this.isInProximity) {
            this.isInProximity = false;
            this.setAction('Idle');
            this.animationSpeed = DEFAULT_ANIM_SPEED;
        }
    }
}

class HintGiver extends Character {
    constructor(x, y) {
        super(x, y, '幫助者'); 
        this.facing = 'right';
        this.isInProximity = false;
        this.disableTimer = 0; // 幫助者自己的冷卻計時器
    }
    
    // 簡化 updateIdle 邏輯，讓它持續動作
    updateIdle(isNear) {
         // 冷卻計時器遞減
        if (this.disableTimer > 0) this.disableTimer--;
        
        // 不再根據靠近與否切換動畫，只保持 Idle 動作
        this.setAction('Idle');
        this.animationSpeed = DEFAULT_ANIM_SPEED / 2;
        this.isInProximity = isNear;
    }
}

// --- P5.js 核心 ---

function preload() {
    window.assets = {};

    function loadList(base, names) {
        const arr = [];
        names.forEach(n => {
            const path = `${base}/${n}`;
            arr.push(loadImage(path, () => {}, () => console.warn('遺失資源:', path)));
        });
        return arr;
    }
    
    // **新增：載入背景圖片**
    // 請確保 Summer2.png 檔案與您的 index.html 或 sketch.js 位於同一目錄，或正確的路徑下
    assets.bgImage = loadImage('Summer2.png', () => {}, () => console.warn('遺失背景圖: Summer2.png'));

    // 載入圖片 (保持不變)
    assets.playerIdle = loadList('主角站', ['0.png','1.png','2.png','3.png','4.png','5.png','6.png','7.png','8.png','9.png']);
    assets.playerWalk = loadList('主角走', ['0.png','1.png','2.png','3.png','4.png','5.png','6.png','7.png','8.png','9.png','10.png','11.png']);
    assets.playerAttack = loadList('主角攻', ['0.png','1.png','2.png','3.png','4.png','5.png','6.png','7.png','8.png','9.png']);

    assets.q1Idle = loadList('提問者1', ['0.png','1.png','2.png','3.png']);
    assets.q1Ask = loadList('提問者1', ['問1.png']);
    assets.q2Idle = loadList('提問者2', ['0.png','1.png','2.png','3.png','4.png','5.png','6.png','7.png']);
    assets.q2Ask = loadList('提問者2', ['問2.png']);
    assets.q3Idle = loadList('提問者3', ['0.png','1.png','2.png']);
    assets.q3Ask = loadList('提問者3', ['問3.png']);

    assets.helper4Idle = loadList('幫助者4', ['0.png','1.png','2.png','3.png','4.png']);
    assets.helper4Ask = loadList('幫助者4', ['幫.png']);
}

function setup() {
    createCanvas(windowWidth, windowHeight);

    // --- 角色初始化 ---
    player = new Player(width / 2, height / 2 + 100);
    player.setFrames({ 'Idle': assets.playerIdle, 'Walk': assets.playerWalk, 'Attack': assets.playerAttack });

    questioners = [
        new Questioner(EDGE_MARGIN_X, EDGE_MARGIN_Y, 1), 
        new Questioner(width / 2, EDGE_MARGIN_Y, 2),
        new Questioner(width - EDGE_MARGIN_X, EDGE_MARGIN_Y, 3) 
    ];

    questioners[0].setFrames({ 'Idle': assets.q1Idle, 'Ask': assets.q1Ask });
    questioners[1].setFrames({ 'Idle': assets.q2Idle, 'Ask': assets.q2Ask });
    questioners[2].setFrames({ 'Idle': assets.q3Idle, 'Ask': assets.q3Ask });

    questioners.forEach(q => {
        q.animationSpeed = DEFAULT_ANIM_SPEED; 
        q.setupQuestions(quizBank);
    });

    hintGiver = new HintGiver(CHAR_SIZE / 2 + 30, height - CHAR_SIZE / 2 - 30); 
    hintGiver.setFrames({ 'Idle': assets.helper4Idle, 'Ask': assets.helper4Ask });

    // --- 建立 UI 介面 ---
    
    // 1. 左下角提示次數面板 (保持不變)
    hintPanel = createDiv('');
    hintPanel.style('position', 'fixed');
    hintPanel.style('left', '20px');
    hintPanel.style('bottom', '20px');
    hintPanel.style('background', 'rgba(0,0,0,0.85)');
    hintPanel.style('color', '#fff');
    hintPanel.style('padding', '10px 15px');
    hintPanel.style('border-radius', '8px');
    hintPanel.style('box-shadow', '0 4px 6px rgba(0,0,0,0.3)');
    hintPanel.style('z-index', '1000');
    
    hintPanelText = createP(`剩餘幫助次數：${helpCount}`);
    hintPanelText.parent(hintPanel);
    hintPanelText.style('margin', '0');

    // 2. 提問者對話框 (Questioner Dialog)
    createQuestionDialogUI();

    // 3. 幫助者題庫選擇 UI (Hint Select Overlay) - 保持不變
    createHintSelectUI();
}

// 提問者對話框 (Questioner Dialog) UI
function createQuestionDialogUI() {
    dialogOverlay = createDiv('');
    dialogOverlay.style('position', 'fixed');
    dialogOverlay.style('top', '0'); dialogOverlay.style('left', '0');
    dialogOverlay.style('width', '100%'); dialogOverlay.style('height', '100%');
    dialogOverlay.style('background', 'rgba(0,0,0,0.7)');
    dialogOverlay.style('display', 'none'); 
    dialogOverlay.style('z-index', '9999');
    dialogOverlay.style('justify-content', 'center');
    dialogOverlay.style('align-items', 'center'); 

    dialogBox = createDiv('');
    dialogBox.parent(dialogOverlay);
    dialogBox.style('background', '#fff');
    dialogBox.style('padding', '30px');
    dialogBox.style('border-radius', '12px');
    dialogBox.style('width', '400px');
    dialogBox.style('box-shadow', '0 10px 25px rgba(0,0,0,0.5)');
    dialogBox.style('text-align', 'center');

    dialogQuestionText = createP('');
    dialogQuestionText.parent(dialogBox);
    dialogQuestionText.style('font-size', '20px');
    dialogQuestionText.style('color', '#333');
    
    // 提示文字區 - 仍然存在但永遠隱藏，用於保持 UI 結構穩定
    currentHintDisplay = createP('');
    currentHintDisplay.parent(dialogBox);
    currentHintDisplay.style('font-size', '16px');
    currentHintDisplay.style('margin', '10px 0 20px 0');
    currentHintDisplay.style('color', '#00796b');
    currentHintDisplay.style('font-weight', 'bold');
    currentHintDisplay.style('border-top', '1px dotted #ccc');
    currentHintDisplay.style('padding-top', '10px');
    currentHintDisplay.hide(); 

    dialogInputEl = createInput('');
    dialogInputEl.parent(dialogBox);
    dialogInputEl.attribute('placeholder', '請輸入答案...');
    dialogInputEl.style('width', '80%');
    dialogInputEl.elt.onkeydown = (e) => { if (e.key === 'Enter') checkAnswer(); }; 
    
    let btnContainer = createDiv('');
    btnContainer.parent(dialogBox);
    btnContainer.style('margin-top', '20px');
    btnContainer.style('display', 'flex'); 
    // 由於只剩兩個按鈕，讓它們分佈在兩側
    btnContainer.style('justify-content', 'space-between'); 

    dialogSubmitEl = createButton('提交答案');
    dialogSubmitEl.parent(btnContainer);
    dialogSubmitEl.style('background-color', '#4CAF50');
    dialogSubmitEl.style('color', 'white');
    dialogSubmitEl.style('border', 'none');
    dialogSubmitEl.style('padding', '10px');
    dialogSubmitEl.style('border-radius', '5px');
    dialogSubmitEl.mousePressed(checkAnswer);
    
    // dialogHintEl (尋求幫助按鈕) **已移除**

    dialogCloseEl = createButton('放棄/離開');
    dialogCloseEl.parent(btnContainer);
    dialogCloseEl.style('background-color', '#f44336');
    dialogCloseEl.style('color', 'white');
    dialogCloseEl.style('border', 'none');
    dialogCloseEl.style('padding', '10px');
    dialogCloseEl.style('border-radius', '5px');
    dialogCloseEl.mousePressed(endQuestioning); 
}

// 幫助者題庫選擇 UI (Hint Select Overlay) - 保持不變
function createHintSelectUI() {
    hintSelectOverlay = createDiv('');
    hintSelectOverlay.style('position', 'fixed');
    hintSelectOverlay.style('top', '0'); hintSelectOverlay.style('left', '0');
    hintSelectOverlay.style('width', '100%'); hintSelectOverlay.style('height', '100%');
    hintSelectOverlay.style('background', 'rgba(0,0,0,0.7)');
    hintSelectOverlay.style('display', 'none'); 
    hintSelectOverlay.style('z-index', '9999');
    hintSelectOverlay.style('justify-content', 'center');
    hintSelectOverlay.style('align-items', 'center'); 

    hintSelectBox = createDiv('');
    hintSelectBox.parent(hintSelectOverlay);
    hintSelectBox.style('background', '#fff');
    hintSelectBox.style('padding', '30px');
    hintSelectBox.style('border-radius', '12px');
    hintSelectBox.style('width', '500px');
    hintSelectBox.style('box-shadow', '0 10px 25px rgba(0,0,0,0.5)');
    hintSelectBox.style('text-align', 'left');

    createP('**幫助者題庫**：請選擇一個題目獲取答案 (只能選擇一題)').parent(hintSelectBox).style('font-size', '18px').style('margin-bottom', '15px');
    
    hintOptionsContainer = createDiv('');
    hintOptionsContainer.parent(hintSelectBox);
    hintOptionsContainer.style('max-height', '300px');
    hintOptionsContainer.style('overflow-y', 'auto');
    hintOptionsContainer.style('padding', '10px');
    hintOptionsContainer.style('border', '1px solid #ccc');
    hintOptionsContainer.style('border-radius', '6px');

    hintAnswerDisplay = createP('');
    hintAnswerDisplay.parent(hintSelectBox);
    hintAnswerDisplay.style('margin-top', '20px');
    hintAnswerDisplay.style('font-size', '24px');
    hintAnswerDisplay.style('color', '#d32f2f');
    hintAnswerDisplay.style('font-weight', 'bold');

    hintLeaveButton = createButton('離開');
    hintLeaveButton.parent(hintSelectBox);
    hintLeaveButton.style('background-color', '#3f51b5');
    hintLeaveButton.style('color', 'white');
    hintLeaveButton.style('border', 'none');
    hintLeaveButton.style('margin-top', '20px');
    hintLeaveButton.style('display', 'none'); 
    hintLeaveButton.mousePressed(endHintSelecting);
}


function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    player.x = width / 2;
    player.y = height / 2 + 100;
    
    // 重新定位 NPC
    questioners[0].x = EDGE_MARGIN_X; questioners[0].y = EDGE_MARGIN_Y;
    questioners[1].x = width / 2; questioners[1].y = EDGE_MARGIN_Y;
    questioners[2].x = width - EDGE_MARGIN_X; questioners[2].y = EDGE_MARGIN_Y;
    hintGiver.x = CHAR_SIZE / 2 + 30; hintGiver.y = height - CHAR_SIZE / 2 - 30;
}

function draw() {
    // **修改：繪製背景圖片**
    // 如果背景圖片已載入，則繪製圖片並拉伸至全螢幕
    // 否則保持原有的藍色背景作為備案
    if (assets.bgImage) {
        image(assets.bgImage, 0, 0, width, height);
    } else {
        background('#669bbc');
    }

    // 繪製與更新提問者
    for (let q of questioners) {
        // 冷卻計時器遞減
        if (q.disableTimer > 0) q.disableTimer--;
        
        const isNear = player.checkCollision(q, QUESTION_TRIGGER_DISTANCE);
        q.updateProximity(isNear);
        q.draw();
    }

    // 繪製幫助者與玩家
    const isHintGiverNear = player.checkCollision(hintGiver, HINT_TRIGGER_DISTANCE);
    hintGiver.updateIdle(isHintGiverNear);
    hintGiver.draw();
    
    // 繪製主角
    player.draw();

    // 遊戲狀態邏輯
    if (gameState === 'playing') {
        player.move();
        checkQuestionerInteraction();
        checkHintGiverInteraction(isHintGiverNear); 
    } else if (gameState === 'questioning' || gameState === 'hintSelecting' || gameState === 'hintMessage') {
        player.move(); 
    } else if (gameState === 'attacking') {
        player.move();
        player.attackTimer--;
        if (player.attackTimer <= 0) {
            player.isAttacking = false;
            gameState = 'playing'; 
            player.animationSpeed = DEFAULT_ANIM_SPEED; 
        }
    } 

    // UI 顯示
    drawHUD();
    drawMessage();
}

function drawHUD() {
    fill(0);
    noStroke();
    textSize(18);
    textAlign(LEFT, TOP);
    text(`得分: ${score}`, 20, 20);
    const totalAnswered = questioners.reduce((acc, q) => acc + q.questionsAnswered, 0);
    text(`進度: ${totalAnswered} / 6`, 20, 45);

    if (score >= 6 && gameState !== 'finished') {
        gameState = 'finished';
        dialogOverlay.style('display', 'none');
        hintSelectOverlay.style('display', 'none');
    }
    if (gameState === 'finished') {
        push();
        textAlign(CENTER, CENTER);
        textSize(60);
        stroke(255);
        strokeWeight(4);
        fill(255, 0, 0);
        text("遊戲勝利！", width / 2, height / 2);
        pop();
    }
}

function drawMessage() {
    if (messageTimer > 0 && messageText) {
        push();
        rectMode(CENTER);
        fill(0, 0, 0, 200);
        let messageY = height - 100;
        rect(width / 2, messageY, textWidth(messageText) + 40, 50, 10);
        fill(255);
        textAlign(CENTER, CENTER);
        textSize(20);
        text(messageText, width / 2, messageY);
        pop();
        messageTimer--;
    }
}

// --- 提問者互動邏輯 (發問) ---

function checkQuestionerInteraction() {
    if (gameState !== 'playing') return;
    for (let q of questioners) {
        if (q.finished) continue;
        if (q.disableTimer <= 0 && q.questionsAnswered < q.maxQuestions && player.checkCollision(q, QUESTION_TRIGGER_DISTANCE)) {
            startQuestioning(q);
            return;
        }
    }
}

function startQuestioning(questioner) {
    if (gameState === 'questioning') return; 

    gameState = 'questioning';
    currentQuestioner = questioner;

    let availableIds = questioner.availableQuestionIds.filter(id => !usedQuestionIds.includes(id));

    dialogOverlay.style('display', 'flex');
    dialogInputEl.value('');
    
    // 角色動畫鎖定
    questioner.facing = (player.x < questioner.x) ? 'right' : 'left';
    questioner.animationSpeed = 0; 
    questioner.setAction('Idle'); 
    player.animationSpeed = 0; 
    player.setAction('Idle'); 
    

    if (availableIds.length > 0) {
        const randomId = random(availableIds);
        currentQuestion = quizBank.find(q => q.id === randomId);
        
        dialogQuestionText.html(`**【${questioner.name} 的問題 ${questioner.questionsAnswered + 1}/${questioner.maxQuestions}】**<br><br>${currentQuestion.question}`);
        
        // **移除所有關於提示邏輯的判斷**
        currentHintDisplay.hide();
        
        dialogInputEl.style('display', 'inline-block');
        dialogSubmitEl.style('display', 'inline-block');
        // dialogHintEl 已被移除
        
        // 確保離開按鈕正確顯示「放棄/離開」
        dialogCloseEl.html('放棄/離開');
        dialogCloseEl.mousePressed(endQuestioning); 

        setTimeout(() => dialogInputEl.elt.focus(), 100);
    } else {
        dialogQuestionText.html(`**【${questioner.name}】**<br>我的題目已經問完了！`);
        currentHintDisplay.hide();
        dialogInputEl.style('display', 'none');
        dialogSubmitEl.style('display', 'none');
        // dialogHintEl 已被移除
        
        // 確保離開按鈕正確顯示「好的」
        dialogCloseEl.html('好的');
        dialogCloseEl.mousePressed(endQuestioning);
    }
}

function checkAnswer() {
    if (!currentQuestion) return;

    let userAnswer = dialogInputEl.value().trim();
    let correctAnswer = currentQuestion.answer; 

    if (userAnswer.toLowerCase() === correctAnswer.toLowerCase()) {
        score++;
        
        // 答對後將該問題 ID 標記為「已完成/使用」，這樣下次就不會再選到此題
        usedQuestionIds.push(currentQuestion.id); 
        
        currentQuestioner.questionsAnswered++;
        
        setMessage('回答正確！', 120);
        
        // 攻擊動畫邏輯
        player.setAction('Attack');
        player.isAttacking = true;
        player.attackTimer = 20;
        gameState = 'attacking'; 
        
        dialogOverlay.style('display', 'none'); 
        currentHintDisplay.hide(); // 答對後隱藏提示文字

        if (currentQuestioner.questionsAnswered >= currentQuestioner.maxQuestions) {
            currentQuestioner.finished = true;
            setTimeout(() => {
                setMessage(`【${currentQuestioner.name}】你答對了我所有的問題！`, 200);
            }, 500);
        }
        
        currentQuestion = null;
        currentQuestioner = null;

    } else {
        setMessage('答案錯誤，再試一次！', 120);
        dialogInputEl.value('');
        dialogInputEl.elt.focus();
    }
}

function endQuestioning() {
    dialogOverlay.style('display', 'none');
    currentHintDisplay.hide(); // 離開時隱藏提示文字
    
    if (currentQuestioner) {
        currentQuestioner.disableTimer = TEMPORARY_DISABLE_FRAMES; 
    }
    
    // 解決幫助者訊息模式下，角色冷卻計時器是綁在 hintGiver 上的問題
    if (gameState === 'hintMessage') {
        hintGiver.disableTimer = TEMPORARY_DISABLE_FRAMES;
    }

    currentQuestion = null;
    currentQuestioner = null;

    if (!player.isAttacking) {
        gameState = 'playing';
        player.animationSpeed = DEFAULT_ANIM_SPEED;
        player.setAction('Idle');
    } 
    
    questioners.forEach(q => {
        q.animationSpeed = DEFAULT_ANIM_SPEED;
        q.isInProximity = false;
    });
}

// 提問者：「尋求幫助」功能 (已移除)
// function requestHintFromDialog() { ... } 

// P5.js 內建事件：處理滑鼠點擊 (保持淨空)
function mousePressed() {
    // 讓其他 P5.js DOM 元素和畫布事件可以繼續
    return true; 
}


// --- 幫助者互動邏輯 (給予答案) - 保持不變 ---

// 新增函數：顯示幫助次數已用完的訊息
function startHintGiverMessage(message) {
    gameState = 'hintMessage';
    
    // 鎖定角色動畫
    hintGiver.setAction('Idle'); 
    hintGiver.animationSpeed = 0;
    player.setAction('Idle');
    player.animationSpeed = 0; 
    
    dialogOverlay.style('display', 'flex');
    
    dialogQuestionText.html(`**【幫助者】**<br>${message}`);
    
    // 隱藏所有輸入和互動元素
    currentHintDisplay.hide(); 
    dialogInputEl.style('display', 'none');
    dialogSubmitEl.style('display', 'none');
    // dialogHintEl 已移除
    
    // 設定「好的」按鈕，並綁定到 endQuestioning (與離開機制相同)
    dialogCloseEl.html('好的'); 
    dialogCloseEl.mousePressed(endQuestioning); 
}

function checkHintGiverInteraction(isNear) {
    if (gameState === 'playing' && isNear && hintGiver.disableTimer <= 0) {
        
        if (helpCount <= 0) {
            // 幫助次數為 0 時，直接顯示訊息
            startHintGiverMessage('很抱歉，您的幫助次數已經用完了，無法再提供答案協助！');
        } else {
            // 幫助次數充足，進入題庫選擇介面
            startHintSelecting();
        }
    }
}

function startHintSelecting() {
    gameState = 'hintSelecting';
    
    // 強制幫助者動畫切換到 Idle，避免停留在 Ask 單幀
    hintGiver.setAction('Idle'); 
    hintGiver.animationSpeed = DEFAULT_ANIM_SPEED / 2;

    player.setAction('Idle');
    
    hintSelectOverlay.style('display', 'flex');
    hintAnswerDisplay.html('');
    hintLeaveButton.style('display', 'none');
    
    generateHintOptions();
}

function generateHintOptions() {
    hintOptionsContainer.html(''); 
    
    let availableQuestions = [];
    questioners.forEach(q => {
        q.availableQuestionIds.forEach(id => {
            // 唯一條件：只要該題還沒被回答過 (不在 usedQuestionIds 內) 就可以被選擇
            if (!usedQuestionIds.includes(id)) {
                const qData = quizBank.find(q => q.id === id);
                if (qData && !availableQuestions.some(aq => aq.id === id)) {
                      availableQuestions.push(qData);
                }
            }
        });
    });
    
    if (availableQuestions.length === 0) {
        hintOptionsContainer.html('<p>所有題目都已回答或已被查詢過答案。</p>');
        hintLeaveButton.style('display', 'block');
        return;
    }

    availableQuestions.forEach(q => {
        const optionDiv = createDiv('');
        optionDiv.style('margin-bottom', '10px');
        
        const radioInput = createInput(`answer_q_${q.id}`, 'radio');
        radioInput.attribute('name', 'hint_selection');
        radioInput.attribute('value', q.id);
        
        radioInput.changed(() => revealAnswer(q.id));
        
        const label = createElement('label', `[ID: ${q.id}] ${q.question}`);
        label.attribute('for', `answer_q_${q.id}`);
        
        optionDiv.child(radioInput);
        optionDiv.child(label);
        hintOptionsContainer.child(optionDiv);
    });
}

function revealAnswer(questionId) {
    const radioButtons = hintOptionsContainer.elt.querySelectorAll('input[type="radio"]');
    radioButtons.forEach(btn => btn.disabled = true);
    
    const question = quizBank.find(q => q.id == questionId);
    
    if (question) {
        // 執行扣次數
        if (helpCount > 0) {
            helpCount--; 
            hintPanelText.html(`剩餘幫助次數：${helpCount}`);
        }
        
        hintAnswerDisplay.html(`答案是：**${question.answer}**`);
        
        // 從幫助者處獲得答案，將該題納入 usedQuestionIds
        if (!usedQuestionIds.includes(question.id)) {
            usedQuestionIds.push(question.id);
        }
        
        setMessage(`從幫助者獲得了題目 ID ${question.id} 的答案。`, 180);
        
        hintLeaveButton.style('display', 'block');
    }
}


function endHintSelecting() {
    hintSelectOverlay.style('display', 'none');
    
    hintGiver.disableTimer = TEMPORARY_DISABLE_FRAMES; 
    
    gameState = 'playing';
    player.animationSpeed = DEFAULT_ANIM_SPEED;
    player.setAction('Idle');
    
    hintGiver.animationSpeed = DEFAULT_ANIM_SPEED / 2;
}

function setMessage(txt, time) {
    messageText = txt;
    messageTimer = time;
}

function keyPressed() {
    if (gameState === 'playing' && key === ' ') {
        player.setAction('Attack');
        player.isAttacking = true;
        player.attackTimer = 20;
        gameState = 'attacking';
    }
}