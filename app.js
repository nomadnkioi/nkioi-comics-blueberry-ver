/* ==========================================================================
   나교이 만화가게_blueberry ver. 🫐 - 프리미엄 코어 자바스크립트 엔진 (app.js)
   ========================================================================== */

// --- 1. 상태 전역 객체 및 타이머 변수 ---
let viewerLoaderTimeout = null;

const state = {
  books: [],             // 로드된 도서 목록 (각 책은 { id, title, author, totalVolumes, volumes: { '1': [blobs], ... } })
  currentBookId: null,   // 현재 열려있는 도서 ID
  currentVolume: 1,      // 현재 읽고 있는 권수
  currentPage: 1,        // 현재 읽고 있는 페이지 (1-indexed)
  viewMode: 'slide',     // 'slide' (가로 슬라이드) 또는 'scroll' (세로 웹툰 스크롤)
  isRotated: false,      // true 시 90도 회전 가로모드
  isFullscreen: false,   // true 시 완벽한 몰입형 전체화면 (조작 UI 숨김)
  
  // 줌 & 팬 관련 상태
  zoomScale: 1,
  panX: 0,
  panY: 0,
  isPanning: false,
  startX: 0,
  startY: 0,
  pinchStartDist: 0,
  pinchStartScale: 1
};

// --- 2. DOM 요소 참조 ---
const DOM = {
  // 화면 및 기본 프레임
  appContainer: document.getElementById('app-container'),
  libraryScreen: document.getElementById('library-screen'),
  viewerScreen: document.getElementById('viewer-screen'),
  emptyState: document.getElementById('empty-state'),
  bookshelf: document.getElementById('bookshelf'),
  btnLoadComics: document.getElementById('btn-load-comics'),
  comicsFileInput: document.getElementById('comics-file-input'),
  viewerLoader: document.getElementById('viewer-loader'),
  
  // 뷰어 및 이미지 캔버스
  comicViewport: document.getElementById('comic-viewport'),
  comicCanvas: document.getElementById('comic-canvas'),
  comicImage: document.getElementById('comic-image'),
  scrollContainer: document.getElementById('scroll-container'),
  
  // 터치 영역
  touchLeft: document.getElementById('touch-left'),
  touchCenter: document.getElementById('touch-center'),
  touchRight: document.getElementById('touch-right'),
  
  // 상/하단 컨트롤러
  btnBackHome: document.getElementById('btn-back-home'),
  btnVolumeSelect: document.getElementById('btn-volume-select'),
  currentVolumeLabel: document.getElementById('current-volume-label'),
  volumeDropdownList: document.getElementById('volume-dropdown-list'),
  volumeSelectorContainer: document.querySelector('.volume-selector-container'),
  
  pageTextIndicator: document.getElementById('page-text-indicator'),
  viewerPageSlider: document.getElementById('viewer-page-slider'),
  gaugeProgress: document.getElementById('gauge-progress'),
  
  // 모달 팝업
  resumeModal: document.getElementById('resume-modal'),
  btnReadStart: document.getElementById('btn-read-start'),
  btnReadResume: document.getElementById('btn-read-resume'),
  
  // 구글 드라이브 설정 및 버튼
  settingsModal: document.getElementById('settings-modal'),
  btnOpenSettings: document.getElementById('btn-open-settings'),
  btnCloseSettings: document.getElementById('btn-close-settings'),
  btnSaveSettings: document.getElementById('btn-save-settings'),
  btnGDriveLogin: document.getElementById('btn-gdrive-login'),
  btnGDriveLogout: document.getElementById('btn-gdrive-logout'),
  btnLoadGDrive: document.getElementById('btn-load-gdrive'),
  inputClientId: document.getElementById('input-client-id'),
  inputApiKey: document.getElementById('input-api-key'),
  gdriveStatusInfo: document.getElementById('gdrive-status-info'),
  
  // 커스텀 구글 드라이브 피커
  gdrivePickerModal: document.getElementById('gdrive-picker-modal'),
  btnClosePicker: document.getElementById('btn-close-picker'),
  pickerBreadcrumb: document.getElementById('picker-breadcrumb'),
  pickerFileList: document.getElementById('picker-file-list'),
  pickerLoader: document.getElementById('picker-loader'),
  pickerListContainer: document.querySelector('.picker-list-container'),
  pickerSortSelect: document.getElementById('picker-sort-select'),
  pickerGlobalStatus: document.getElementById('picker-global-status'),
  pickerGlobalStatusText: document.getElementById('picker-global-status-text')
};

// --- 3. 지능형 파일명/메타데이터 분석 정규식 파서 ---
function parseComicFileName(fileName) {
  // 확장자 제거 및 양끝 따옴표/공백 제거
  let cleanName = fileName.replace(/\.[^/.]+$/, "").trim();
  cleanName = cleanName.replace(/^['"]+|['"]+$/g, "").trim();
  
  let author = "작자미상";
  let title = cleanName;
  let volume = 1;
  let isVolumeDetected = false;
  let unit = "권";
  
  // 1. 대괄호 [작가] 또는 소괄호 (작가) 패턴 추출 (가장 처음)
  let workingName = cleanName;
  const authorMatch = cleanName.match(/^\[([^\]]+)\]/);
  if (authorMatch) {
    author = authorMatch[1].trim();
    workingName = cleanName.substring(authorMatch[0].length).trim();
  } else {
    const parenMatch = cleanName.match(/^\(([^)]+)\)/);
    if (parenMatch) {
      author = parenMatch[1].trim();
      workingName = cleanName.substring(parenMatch[0].length).trim();
    }
  }

  // 1.5. "부" 패턴 탐지 및 처리 (예: "호스트 시리즈 5부 - 또하나의 시작 02")
  const partMatch = workingName.match(/(\d+)\s*부/);
  const isExtraFile = /(?:번외|외전|특별편|부록|\bsp\b|\bextra\b|\bside\b|비하인드)/i.test(workingName);
  
  if (partMatch) {
    const partVal = parseInt(partMatch[1], 10);
    // 파일명 끝부분의 숫자 감지 (괄호 제거 후)
    let endText = workingName.replace(/[\(\[][^\)\]]+[\)\]]/g, " ").trim();
    const trailingMatch = endText.match(/(\d+)\s*$/);
    
    if (trailingMatch && parseInt(trailingMatch[1], 10) !== partVal) {
      const subVal = parseInt(trailingMatch[1], 10);
      volume = partVal + (subVal / 100);
      // 타이틀 정제: '5부', '02' 제거
      title = workingName.replace(partMatch[0], "").replace(trailingMatch[0], "").replace(/\s*-\s*$/, "").trim();
    } else {
      volume = partVal;
      title = workingName.replace(partMatch[0], "").trim();
    }
    
    // 특수 문자 및 대시 정제
    title = title.replace(/^[-_\s\:\(\)]+/, "").replace(/[-_\s\:\(\)]+$/, "").trim();
    unit = "부";
    isVolumeDetected = true;
    
    const result = { author, title, volume, isVolumeDetected, unit };
    console.log(`[파서 디버그 - 부 패턴] 파일명: "${fileName}" -> 파싱결과:`, result);
    return result;
  } else if (isExtraFile && !workingName.match(/(\d+)\s*(?:권|화|부)/)) {
    // 다른 권수 정보 없이 번외/외전만 있는 경우 최하단 정렬을 위해 999로 설정
    volume = 999;
    unit = "권";
    isVolumeDetected = true;
    title = workingName.replace(/(?:번외|외전|특별편|부록|\bsp\b|\bextra\b|\bside\b|비하인드)/gi, "").trim();
    title = title.replace(/^[-_\s\:\(\)]+/, "").replace(/[-_\s\:\(\)]+$/, "").trim();
    
    const result = { author, title, volume, isVolumeDetected, unit };
    console.log(`[파서 디버그 - 번외 패턴] 파일명: "${fileName}" -> 파싱결과:`, result);
    return result;
  }

  // [날짜 원천 제거] 월.일 날짜 패턴 제거 (예: "04.25", "12.31", "5.03") - 단, 뒤에 권/화가 있으면 보존
  workingName = workingName.replace(/(?<=[^0-9]|^)(?:0?[1-9]|1[0-2])\.(?:0?[1-9]|[12][0-9]|3[01])(?!\s*(?:권|화|vol|ch))(?=[^0-9]|$)/gi, "").trim();
  
  // [날짜 원천 제거] 6자리 날짜 패턴 제거 (예: "240425") - 단, 뒤에 권/화가 있으면 보존
  workingName = workingName.replace(/(?<=[^0-9]|^)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12][0-9]|3[01])(?!\s*(?:권|화|vol|ch))(?=[^0-9]|$)/gi, "").trim();

  // [날짜 원천 제거] 4자리 연도 제거 (예: "2024")
  workingName = workingName.replace(/(?<=[^0-9]|^)\d{4}(?!\s*(?:권|화|vol|ch))(?=[^0-9]|$)/gi, "").trim();
  
  // 앞부분에 "숫자 + 구분자"가 있는지 검사 (예: "1 봄의 잔물결", "2 - 겨울의 잔물결", "1.5 봄의 잔물결")
  // 단, 뒤쪽에 명시적인 권수 표현이 있다면 앞의 숫자는 무시함
  const hasExplicitVolumeLater = /(?:제\s*)?(\d+(?:\.\d+)?)\s*(?:권|화)/i.test(workingName) || 
                                 /(?:vol(?:\. |ume)?|v|ch(?:apter)?\.?)\s*(\d+(?:\.\d+)?)/i.test(workingName);
  
  const leadingNumMatch = workingName.match(/^(\d+(?:\.\d+)?)(?:\s*[\.\-\_]\s*|\s+)(.*)$/);
  
  if (leadingNumMatch && !hasExplicitVolumeLater) {
    volume = parseFloat(leadingNumMatch[1]);
    title = leadingNumMatch[2].trim();
    isVolumeDetected = true;
  } else {
    // 괄호 안의 텍스트들을 추출하여 가중치를 낮춘 별도 검사 대상 목록으로 보관
    const parenthesesTextList = [];
    const bracketRegex = /[\(\[]([^\)\]]+)[\)\]]/g;
    let m;
    while ((m = bracketRegex.exec(workingName)) !== null) {
      parenthesesTextList.push(m[1].trim());
    }
    
    // 메인 텍스트 영역 (괄호 안을 제거한 영역)
    let mainText = workingName.replace(/[\(\[][^\)\]]+[\)\]]/g, " ").replace(/\s+/g, " ").trim();
    
    // 0순위: 상권/하권 계열 키워드 우선 감지
    function extractSangHa(text) {
      if (!text) return null;
      const sangPattern = /(?:상권|上권|(?<=[^가-힣a-zA-Z0-9]|^)(?:상|上)(?=[^가-힣a-zA-Z0-9]|$))/;
      const haPattern = /(?:하권|下권|(?<=[^가-힣a-zA-Z0-9]|^)(?:하|下)(?=[^가-힣a-zA-Z0-9]|$))/;
      
      if (sangPattern.test(text)) {
        const match = text.match(sangPattern);
        return { val: 1, raw: match[0] };
      }
      if (haPattern.test(text)) {
        const match = text.match(haPattern);
        return { val: 2, raw: match[0] };
      }
      return null;
    }

    // 우선순위 기반 숫자 추출 함수
    function extractVolume(text) {
      if (!text) return null;
      
      const koMatch = text.match(/(?:제\s*)?(\d+(?:\.\d+)?)\s*(?:권|화)/i);
      if (koMatch) {
        let val = parseFloat(koMatch[1]);
        let raw = koMatch[0];
        
        if (/화$/i.test(raw)) {
          unit = "화";
        }
        
        const postText = text.substring(text.indexOf(raw) + raw.length);
        const preText = text.substring(0, text.indexOf(raw));
        
        const sangPattern = /(?:상권|上권|(?<=[^가-힣a-zA-Z0-9]|^)(?:상|上)(?=[^가-힣a-zA-Z0-9]|$))/;
        const haPattern = /(?:하권|下권|(?<=[^가-힣a-zA-Z0-9]|^)(?:하|下)(?=[^가-힣a-zA-Z0-9]|$))/;
        
        if (sangPattern.test(postText)) {
          val += 0.1;
          const match = postText.match(sangPattern);
          const matchIndex = postText.indexOf(match[0]);
          raw += postText.substring(0, matchIndex + match[0].length);
        } else if (sangPattern.test(preText)) {
          val += 0.1;
          const match = preText.match(sangPattern);
          const matchIndex = preText.indexOf(match[0]);
          raw = preText.substring(matchIndex) + raw;
        } else if (haPattern.test(postText)) {
          val += 0.2;
          const match = postText.match(haPattern);
          const matchIndex = postText.indexOf(match[0]);
          raw += postText.substring(0, matchIndex + match[0].length);
        } else if (haPattern.test(preText)) {
          val += 0.2;
          const match = preText.match(haPattern);
          const matchIndex = preText.indexOf(match[0]);
          raw = preText.substring(matchIndex) + raw;
        }
        
        return { val, raw };
      }
      
      const sangHaResult = extractSangHa(text);
      if (sangHaResult) {
        const val = sangHaResult.val === 1 ? 1.1 : 1.2;
        return { val, raw: sangHaResult.raw };
      }
      
      const enMatch = text.match(/(?:vol(?:\. |ume)?|v|ch(?:apter)?\.?)\s*(\d+(?:\.\d+)?)/i);
      if (enMatch) {
        if (/ch(?:apter)?/i.test(enMatch[0])) {
          unit = "화";
        }
        return { val: parseFloat(enMatch[1]), raw: enMatch[0] };
      }
      
      const sepMatch = text.match(/[-_\s]+(\d+(?:\.\d+)?)\s*$/);
      if (sepMatch) {
        const valStr = sepMatch[1];
        return { val: parseFloat(valStr), raw: sepMatch[0] };
      }
      
      const lastNumMatch = text.match(/(\d+(?:\.\d+)?)\s*$/);
      if (lastNumMatch) {
        const valStr = lastNumMatch[1];
        return { val: parseFloat(valStr), raw: lastNumMatch[0] };
      }
      
      return null;
    }
    
    let extraction = extractVolume(mainText);
    
    if (!extraction) {
      for (const parenText of parenthesesTextList) {
        const res = extractVolume(parenText);
        if (res) {
          extraction = res;
          break;
        }
      }
    }
    
    if (extraction) {
      volume = extraction.val;
      isVolumeDetected = true;
      title = mainText.replace(extraction.raw, "").trim();
    } else {
      title = mainText;
    }
  }
  
  title = title.replace(/^[-_\s\:\(\)]+/, "").replace(/[-_\s\:\(\)]+$/, "").trim();
  
  // 제목 맨 앞의 불필요한 일련번호/접두사 제거 (예: "5.동급생" -> "동급생", "6 - 동급생" -> "동급생")
  title = title.replace(/^(\d+(?:\.\d+)?)(?:\s*[\.\-\_]\s*|\s+)/, "");
  
  title = title.replace(/^[-_\s\:\(\)]+/, "").replace(/[-_\s\:\(\)]+$/, "").trim();
  if (!title) title = cleanName;

  // 번외/외전 등 키워드 감지 시 소수점(0.5)을 더해 원본 권수 바로 뒤에 정렬되도록 조정
  // 단, "단편+외전" 이나 "본편+외전", "1권+외전" 처럼 결합되어 있는 형태는 제외함
  const hasExtraKeyword = /(?:번외|외전|특별편|부록|\bsp\b|\bextra\b|\bside\b|비하인드)/i.test(cleanName);
  const isCombinedExtra = /(?:\+|및|과|와)\s*(?:번외|외전|특별편|부록|sp|extra|side)/i.test(cleanName);
  
  if (hasExtraKeyword && !isCombinedExtra && Number.isInteger(volume)) {
    volume += 0.5;
  }
  
  const result = { author, title, volume, isVolumeDetected, unit };
  console.log(`[파서 디버그] 파일명: "${fileName}" -> 파싱결과:`, result);
  return result;
}

// 비동기 무한 대기 락(Lock)을 방지하기 위한 타임아웃 래퍼 프로미스
function timeoutPromise(promise, ms, rejectMessage = "요청 시간이 초과되었습니다.") {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(rejectMessage));
    }, ms);
    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// --- 3.5. 양면 이미지 분할 헬퍼 함수 및 이미지 처리 파이프라인 ---
async function splitDoublePageImageIfNeeded(blobUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const ratio = img.naturalWidth / img.naturalHeight;
      console.log(`[분할 엔진] 이미지 분석 완료 - 해상도: ${img.naturalWidth}x${img.naturalHeight}, 비율: ${ratio.toFixed(2)}, 대상 URL: ${blobUrl.substring(0, 30)}...`);
      
      if (ratio >= 1.2) {
        console.log(`[분할 엔진] 가로 비율이 1.2 이상이므로 분할을 진행합니다.`);
        const width = img.naturalWidth;
        const height = img.naturalHeight;
        const halfWidth = Math.floor(width / 2);
        
        // 오른쪽 절반용 캔버스 (일본식 만화: 오른쪽 페이지가 먼저 온다)
        const rightCanvas = document.createElement('canvas');
        rightCanvas.width = halfWidth;
        rightCanvas.height = height;
        const rightCtx = rightCanvas.getContext('2d');
        rightCtx.drawImage(img, halfWidth, 0, width - halfWidth, height, 0, 0, width - halfWidth, height);
        
        // 왼쪽 절반용 캔버스
        const leftCanvas = document.createElement('canvas');
        leftCanvas.width = halfWidth;
        leftCanvas.height = height;
        const leftCtx = leftCanvas.getContext('2d');
        leftCtx.drawImage(img, 0, 0, halfWidth, height, 0, 0, halfWidth, height);
        
        Promise.all([
          new Promise(r => rightCanvas.toBlob(r, 'image/jpeg', 0.9)),
          new Promise(r => leftCanvas.toBlob(r, 'image/jpeg', 0.9))
        ]).then(([rightBlob, leftBlob]) => {
          const rightUrl = URL.createObjectURL(rightBlob);
          const leftUrl = URL.createObjectURL(leftBlob);
          resolve([rightUrl, leftUrl]);
        }).catch((err) => {
          console.error("[분할 엔진] 캔버스 변환 중 오류:", err);
          resolve([blobUrl]);
        });
      } else {
        resolve([blobUrl]);
      }
    };
    img.onerror = (err) => {
      console.error("[분할 엔진] 이미지 로드 중 에러 발생:", err);
      resolve([blobUrl]);
    };
    img.src = blobUrl; // onload/onerror 바인딩 후에 src 대입하여 레이스 컨디션 방지
  });
}

// --- 3.7. 압축파일 해제 공통 래퍼 (ZIP, CBZ, RAR, CBR 통합 지원) ---
class ArchiveWrapper {
  constructor(fileOrBlob, fileName) {
    this.fileOrBlob = fileOrBlob;
    this.fileName = fileName;
    this.type = (/\.(rar|cbr)$/i.test(fileName)) ? 'rar' : 'zip';
    this.jszip = null;
    this.unarchiver = null;
    this.filePaths = [];
  }
  
  async load() {
    if (this.type === 'zip') {
      this.jszip = await JSZip.loadAsync(this.fileOrBlob, {
        decodeFileName: function (bytes) {
          let uint8;
          if (typeof bytes === 'string') {
            uint8 = new Uint8Array(bytes.length);
            for (let i = 0; i < bytes.length; i++) {
              uint8[i] = bytes.charCodeAt(i) & 0xff;
            }
          } else {
            uint8 = bytes;
          }
          try {
            return new TextDecoder('utf-8', { fatal: true }).decode(uint8);
          } catch (e) {
            try {
              return new TextDecoder('euc-kr').decode(uint8);
            } catch (err) {
              return new TextDecoder('windows-949').decode(uint8);
            }
          }
        }
      });
      this.filePaths = Object.keys(this.jszip.files).filter(path => !this.jszip.files[path].dir);
    } else {
      if (typeof Unarchiver === 'undefined') {
        throw new Error("Unarchiver.js 라이브러리가 로드되지 않았습니다.");
      }
      this.unarchiver = await Unarchiver.open(this.fileOrBlob);
      this.filePaths = this.unarchiver.entries.filter(e => e.is_file).map(e => e.path || e.name || "");
    }
  }
  
  async readAsBlob(path) {
    if (this.type === 'zip') {
      const zipFile = this.jszip.files[path];
      if (!zipFile) throw new Error(`파일 없음: ${path}`);
      return await zipFile.async("blob");
    } else {
      const entry = this.unarchiver.entries.find(e => (e.path || e.name || "") === path);
      if (!entry) throw new Error(`파일 없음: ${path}`);
      const arrayBuffer = await entry.read();
      return new Blob([arrayBuffer]);
    }
  }
}

async function processImagesWithSplit(archive, paths, onProgress) {
  const resultUrls = [];
  for (let i = 0; i < paths.length; i++) {
    if (onProgress) {
      onProgress(i + 1, paths.length);
    }
    const blob = await archive.readAsBlob(paths[i]);
    const originalUrl = URL.createObjectURL(blob);
    const splitUrls = await splitDoublePageImageIfNeeded(originalUrl);
    resultUrls.push(...splitUrls);
  }
  return resultUrls;
}

// --- 4. JSZip/Unarchiver 기반 지능형 하이브리드 파일 파서 (온디맨드 방식) ---
async function processUploadedFiles(files) {
  showLoader("도서를 분석 중입니다...");
  
  // [전역 세이프가드 타이머] 외부 라이브러리(libunrar 등) 비동기 락 방지용 (12초)
  const safeguardTimer = setTimeout(() => {
    hideLoader();
    renderBookshelf();
    alert("도서 분석 중 시간 초과가 발생했습니다.\n일부 손상된 압축 파일(RAR 등)이 있거나 지원하지 않는 규격일 수 있습니다.");
  }, 12000);
  
  const bookGroupMap = {};
  let batchGroupKey = null;
  let batchBookTitle = null;
  let batchAuthor = null;

  try {
    // 동일 배치 내 파일들이 숫자로 시작하는지 확인하여 한 시리즈로 묶기
    let shouldGroupBatch = false;
    if (files.length > 1) {
      let leadingNumCount = 0;
      for (let i = 0; i < files.length; i++) {
        const cleanName = files[i].name.replace(/\.[^/.]+$/, "").trim();
        if (/^\d+/.test(cleanName)) {
          leadingNumCount++;
        }
      }
      if (leadingNumCount >= files.length / 2) {
        shouldGroupBatch = true;
      }
    }

    if (shouldGroupBatch) {
      const sortedFiles = Array.from(files).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
      const firstMeta = parseComicFileName(sortedFiles[0].name);
      batchBookTitle = firstMeta.title;
      batchAuthor = firstMeta.author;
      const normalizedTitle = batchBookTitle.replace(/\s+/g, "");
      batchGroupKey = `${batchAuthor}_${normalizedTitle}`;
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!/\.(zip|cbz|rar|cbr)$/i.test(file.name)) continue;

      try {
        const archive = new ArchiveWrapper(file, file.name);
        await timeoutPromise(archive.load(), 10000, "압축 파일을 해제하는 도중 백그라운드 스레드 오류가 발생했거나 시간이 초과되었습니다.");
        const allFiles = archive.filePaths;
        
        // 1. 이미지 및 내부 압축 파일 탐색
        const imageFiles = allFiles.filter(path => /\.(jpg|jpeg|png|webp|gif)$/i.test(path) && !path.includes('__MACOSX'));
        const nestedZipFiles = allFiles.filter(path => /\.(zip|cbz|rar|cbr)$/i.test(path) && !path.includes('__MACOSX'));
        
        let meta = parseComicFileName(file.name);
        
        // 하위 폴더가 존재할 경우 하위 폴더명을 기준으로 만화 이름 파싱 (일괄 묶기가 아닐 때만 적용)
        if (!shouldGroupBatch) {
          const folderNames = new Set();
          imageFiles.forEach(path => {
            const parts = path.split('/');
            if (parts.length > 1) {
              folderNames.add(parts[0]);
            }
          });
          
          if (folderNames.size > 0) {
            const firstFolder = Array.from(folderNames)[0];
            const folderMeta = parseComicFileName(firstFolder);
            if (folderMeta && folderMeta.title) {
              meta.title = folderMeta.title;
              if (folderMeta.author && folderMeta.author !== "작자미상") {
                meta.author = folderMeta.author;
              }
            }
          }
        }
        
        const groupKey = shouldGroupBatch ? batchGroupKey : `${meta.author}_${meta.title.replace(/\s+/g, "")}`;
        const bookTitle = shouldGroupBatch ? batchBookTitle : meta.title;
        const bookAuthor = shouldGroupBatch ? batchAuthor : meta.author;
        
        if (!bookGroupMap[groupKey]) {
          bookGroupMap[groupKey] = {
            id: groupKey,
            title: bookTitle,
            author: bookAuthor,
            volumes: {},
            archives: {},      // 권별 ArchiveWrapper 보관용
            rawFiles: {},      // 권별 원본 파일/Blob 보관용 (메모리 재건축용)
            volumeTitles: {}, // 각 권의 고유 제목 매핑용
            volumeUnits: {},  // 각 권의 단위(권/화) 매핑용
            detectedVolumesInfo: {}
          };
        }
        
        bookGroupMap[groupKey].detectedVolumesInfo[meta.volume] = meta.isVolumeDetected;
        bookGroupMap[groupKey].volumeTitles[meta.volume] = meta.title;
        bookGroupMap[groupKey].volumeUnits[meta.volume] = meta.unit || "권";
        
        // 케이스 A: 하위 폴더별로 이미지가 존재하여 여러 권으로 나뉘는 경우
        const folderGroups = {};
        imageFiles.forEach(path => {
          const parts = path.split('/');
          if (parts.length > 1) {
            const folderName = parts[0];
            const folderMeta = parseComicFileName(folderName);
            const fVol = folderMeta.volume;
            if (!folderGroups[fVol]) folderGroups[fVol] = [];
            folderGroups[fVol].push(path);
            
            if (bookGroupMap[groupKey].detectedVolumesInfo[fVol] === undefined) {
              bookGroupMap[groupKey].detectedVolumesInfo[fVol] = folderMeta.isVolumeDetected;
            }
            bookGroupMap[groupKey].volumeTitles[fVol] = folderMeta.title;
            bookGroupMap[groupKey].volumeUnits[fVol] = folderMeta.unit || "권";
          }
        });

        // 단일 압축 안에 여러 하위 폴더 권이 명확히 구별되는 경우
        if (Object.keys(folderGroups).length > 1) {
          const volEntries = Object.entries(folderGroups);
          for (let vIdx = 0; vIdx < volEntries.length; vIdx++) {
            const [volNum, paths] = volEntries[vIdx];
            paths.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
            
            // 온디맨드 방식으로 경로 매핑만 진행
            bookGroupMap[groupKey].volumes[volNum] = paths.map(p => ({ path: p, url: null }));
            bookGroupMap[groupKey].archives[volNum] = archive;
            bookGroupMap[groupKey].rawFiles[volNum] = file; // 폴더 분할인 경우 원본 zip 파일 공유
          }
        } 
        // 케이스 B: 중첩된 압축 파일들이 압축 안에 들어있는 경우
        else if (nestedZipFiles.length > 0) {
          for (let nIdx = 0; nIdx < nestedZipFiles.length; nIdx++) {
            const nzPath = nestedZipFiles[nIdx];
            const nzBlob = await archive.readAsBlob(nzPath);
            
            const subArchive = new ArchiveWrapper(nzBlob, nzPath);
            await timeoutPromise(subArchive.load(), 10000, "중첩 압축 파일을 해제하는 도중 백그라운드 스레드 오류가 발생했거나 시간이 초과되었습니다.");
            const subAllFiles = subArchive.filePaths;
            
            const subImages = subAllFiles.filter(p => /\.(jpg|jpeg|png|webp|gif)$/i.test(p));
            subImages.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
            
            const subMeta = parseComicFileName(nzPath);
            bookGroupMap[groupKey].detectedVolumesInfo[subMeta.volume] = subMeta.isVolumeDetected;
            bookGroupMap[groupKey].volumeTitles[subMeta.volume] = subMeta.title;
            bookGroupMap[groupKey].volumeUnits[subMeta.volume] = subMeta.unit || "권";
            
            // 온디맨드 방식으로 경로 매핑만 진행
            bookGroupMap[groupKey].volumes[subMeta.volume] = subImages.map(p => ({ path: p, url: null }));
            bookGroupMap[groupKey].archives[subMeta.volume] = subArchive;
            bookGroupMap[groupKey].rawFiles[subMeta.volume] = nzBlob; // 추출된 중첩 blob 저장
          }
        }
        // 케이스 C: 일반적인 단일 권 압축 파일인 경우
        else if (imageFiles.length > 0) {
          imageFiles.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
          
          // 온디맨드 방식으로 경로 매핑만 진행
          bookGroupMap[groupKey].volumes[meta.volume] = imageFiles.map(p => ({ path: p, url: null }));
          bookGroupMap[groupKey].archives[meta.volume] = archive;
          bookGroupMap[groupKey].rawFiles[meta.volume] = file; // 원본 업로드 file 저장
        }
        
      } catch (err) {
        console.error("압축 파일 처리 오류:", err);
        alert(`[${file.name}] 압축 파일을 푸는 도중 오류가 발생했습니다:\n${err.message}`);
      }
    }

    // 1권 보정 및 최종 상태 업데이트
    Object.values(bookGroupMap).forEach(parsedBook => {
      const volKeys = Object.keys(parsedBook.volumes).map(Number);
      if (volKeys.length === 0) return;
      
      const hasUninferredVolume1 = parsedBook.detectedVolumesInfo[1] === false;
      const detectedVols = volKeys.filter(v => parsedBook.detectedVolumesInfo[v] === true);
      const hasDetectedVolume2 = detectedVols.includes(2);
      
      if (hasUninferredVolume1 && hasDetectedVolume2) {
        console.log(`[보정] ${parsedBook.title}의 확실한 2권이 발견되었으므로, 미인식 권을 1권으로 유추 확정합니다.`);
      }
      
      parsedBook.totalVolumes = Math.max(...volKeys);
      
      const existingIndex = state.books.findIndex(b => b.id === parsedBook.id);
      if (existingIndex > -1) {
        state.books[existingIndex].volumes = {
          ...state.books[existingIndex].volumes,
          ...parsedBook.volumes
        };
        state.books[existingIndex].archives = {
          ...state.books[existingIndex].archives,
          ...parsedBook.archives
        };
        state.books[existingIndex].rawFiles = {
          ...state.books[existingIndex].rawFiles,
          ...parsedBook.rawFiles
        };
        state.books[existingIndex].volumeTitles = {
          ...state.books[existingIndex].volumeTitles,
          ...parsedBook.volumeTitles
        };
        state.books[existingIndex].volumeUnits = {
          ...state.books[existingIndex].volumeUnits,
          ...parsedBook.volumeUnits
        };
        state.books[existingIndex].totalVolumes = Math.max(
          state.books[existingIndex].totalVolumes,
          parsedBook.totalVolumes
        );
      } else {
        state.books.push(parsedBook);
      }
    });

    if (Object.keys(bookGroupMap).length === 0) {
      alert("불러올 수 있는 유효한 만화책 압축 파일이 없거나 압축 풀기에 실패했습니다.");
    }
  } catch (globalErr) {
    console.error("도서 처리 치명적 오류:", globalErr);
    alert(`도서를 처리하는 과정에서 해결할 수 없는 시스템 에러가 발생했습니다:\n${globalErr.message}`);
  } finally {
    clearTimeout(safeguardTimer);
    hideLoader();
    renderBookshelf();
  }
}

// --- 4.5. 온디맨드(지연) 로딩 및 메모리 윈도우 엔진 ---
async function getPageUrl(book, volume, pageIndex) {
  const pages = book.volumes[volume];
  if (!pages || !pages[pageIndex]) return null;

  const pageObj = pages[pageIndex];

  // 0. 일반적인 텍스트 URL 문자열(구글 드라이브 캐시 등)인 경우 하위호환성 유지 및 안전한 리턴
  if (typeof pageObj === 'string') {
    return pageObj;
  }

  // 1. 이미 Blob URL이 생성되어 있다면 즉시 사용
  if (pageObj.url) {
    return pageObj.url;
  }

  // 2. 분할 페이지의 두 번째 반쪽이고 URL이 아직 없는 경우
  if (pageObj.isSecondHalf && !pageObj.url) {
    // 이전 페이지(첫 번째 반쪽)를 로드하면 이 페이지의 URL도 채워지므로 순차적으로 로드
    await getPageUrl(book, volume, pageIndex - 1);
    return pageObj.url;
  }

  // 3. 경로 정보가 존재하는 경우 실시간 해제
  if (pageObj.path) {
    if (!book.archives) {
      book.archives = {};
    }
    if (!book.archives[volume] && book.rawFiles && book.rawFiles[volume]) {
      try {
        const rawFile = book.rawFiles[volume];
        const archive = new ArchiveWrapper(rawFile, rawFile.name || `volume_${volume}.zip`);
        await archive.load();
        book.archives[volume] = archive;
      } catch (restoreErr) {
        console.error("아카이브 메모리 복원 실패:", restoreErr);
        return null;
      }
    }

    const archive = book.archives[volume];
    if (!archive) return null;

    try {
      const blob = await archive.readAsBlob(pageObj.path);
      const tempUrl = URL.createObjectURL(blob);
      
      // 양면 이미지 분할 검사
      const splitUrls = await splitDoublePageImageIfNeeded(tempUrl);
      if (splitUrls.length > 1) {
        pageObj.url = splitUrls[0];
        pageObj.isSplit = true;
        
        // 두 번째 반쪽을 가리키는 페이지 객체 생성 및 배열 삽입 (아직 생성되지 않은 경우에만)
        const nextIdx = pageIndex + 1;
        const nextObj = pages[nextIdx];
        if (!nextObj || !nextObj.isSecondHalf || nextObj.path !== pageObj.path) {
          const nextPageObj = {
            path: pageObj.path,
            url: splitUrls[1],
            isSplit: true,
            isSecondHalf: true
          };
          pages.splice(nextIdx, 0, nextPageObj);
          
          // 동적으로 늘어난 페이지 수에 맞춰 슬라이더 최댓값 갱신
          DOM.viewerPageSlider.max = pages.length;
          updateGaugeProgress();
        } else {
          // 이미 존재하면 URL만 업데이트
          nextObj.url = splitUrls[1];
        }
        
        if (tempUrl !== splitUrls[0] && tempUrl !== splitUrls[1]) {
          URL.revokeObjectURL(tempUrl);
        }
        return splitUrls[0];
      } else {
        pageObj.url = tempUrl;
        return tempUrl;
      }
    } catch (err) {
      console.error("페이지 지연 로딩 실패:", err);
      return null;
    }
  }

  return null;
}

function manageMemoryWindow(book, volume, currentPageIndex) {
  const pages = book.volumes[volume];
  if (!pages) return;

  const windowSize = 3; // 현재 페이지 앞뒤로 3페이지까지만 메모리 유지

  for (let i = 0; i < pages.length; i++) {
    const pageObj = pages[i];
    if (pageObj && pageObj.url) {
      if (Math.abs(i - currentPageIndex) > windowSize) {
        // 윈도우 범위를 초과하는 페이지는 Blob URL 해제
        URL.revokeObjectURL(pageObj.url);
        pageObj.url = null;
      }
    }
  }
}

// --- 5. 서재 렌더링 엔진 ---
function renderBookshelf() {
  if (state.books.length === 0) {
    DOM.emptyState.style.display = 'flex';
    DOM.bookshelf.style.display = 'none';
    return;
  }
  
  DOM.emptyState.style.display = 'none';
  DOM.bookshelf.style.display = 'grid';
  DOM.bookshelf.innerHTML = '';
  
  state.books.forEach(book => {
    const firstVolKey = Object.keys(book.volumes).sort((a, b) => Number(a) - Number(b))[0];
    
    // 저장된 진행 기록 파악
    const progress = getSavedProgress(book.id);
    let progressHTML = '';
    const representativeUnit = book.volumeUnits?.[firstVolKey] || "권";
    
    if (progress) {
      const progressUnit = book.volumeUnits?.[progress.volume] || "권";
      progressHTML = `
        <div class="comic-card-progress">
          <span>${progress.volume}${progressUnit} ${progress.page}페이지 읽음</span>
        </div>
      `;
    }
    
    const card = document.createElement('div');
    card.className = 'comic-card';
    card.innerHTML = `
      <div class="comic-card-thumbnail-wrapper">
        <img class="comic-card-thumbnail" id="thumb-${book.id}" src="" alt="${book.title}" loading="lazy">
      </div>
      <div class="comic-card-meta">
        <h4 class="comic-card-title">${book.title}</h4>
        <span class="comic-card-volumes">총 ${book.totalVolumes}${representativeUnit}</span>
        ${progressHTML}
      </div>
    `;
    
    // 비동기 온디맨드 썸네일 이미지 로드 바인딩
    getPageUrl(book, firstVolKey, 0).then(url => {
      const img = document.getElementById(`thumb-${book.id}`);
      if (img && url) {
        img.src = url;
      }
    }).catch(err => console.error("썸네일 로딩 실패:", err));
    
    card.addEventListener('click', () => selectBook(book.id));
    DOM.bookshelf.appendChild(card);
  });

  // 북쉘프 하단에 추가 불러오기 버튼 삽입
  const addMoreWrapper = document.createElement('div');
  addMoreWrapper.className = 'bookshelf-add-more';
  addMoreWrapper.innerHTML = `
    <button class="btn-primary btn-load-more" id="btn-load-more" style="width: 100%; justify-content: center;">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="17 8 12 3 7 8"></polyline>
        <line x1="12" y1="3" x2="12" y2="15"></line>
      </svg>
      <span>기기에서 불러오기 🐯</span>
    </button>
    <button class="btn-primary btn-load-more btn-gdrive-more" id="btn-gdrive-more" style="margin-top: 10px; width: 100%; justify-content: center;">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
      </svg>
      <span>구글 드라이브 연결</span>
    </button>
    <p class="add-more-tip" style="display: none; font-size: 14px; margin-top: 12px; color: var(--text-primary); font-weight: 600; text-align: center; width: 100%;"></p>
  `;
  addMoreWrapper.querySelector('#btn-load-more').addEventListener('click', () => DOM.comicsFileInput.click());
  addMoreWrapper.querySelector('#btn-gdrive-more').addEventListener('click', () => handleGDriveButtonClick());
  DOM.bookshelf.appendChild(addMoreWrapper);

  // 구글 드라이브 버튼 상태 동기화
  updateGDriveStatusUI();
}

// --- 6. 책 선택 및 이어보기 조율 ---
function selectBook(bookId) {
  state.currentBookId = bookId;
  const progress = getSavedProgress(bookId);
  
  if (progress) {
    // 이어보기 기록이 있으면 모달 팝업 오픈
    DOM.resumeModal.classList.add('active');
  } else {
    // 처음 로드하는 책일 때
    startReading(1, 1);
  }
}

function startReading(volume, page) {
  DOM.resumeModal.classList.remove('active');
  state.currentVolume = volume;
  state.currentPage = page;
  
  // 라이브러리 숨기고 뷰어 가동
  DOM.libraryScreen.classList.remove('active');
  DOM.viewerScreen.classList.add('active');
  
  // 뒤로가기 제스처 방지를 위해 history state 추가 (이미 뷰어 상태가 아닐 때만)
  if (history.state?.screen !== 'viewer') {
    history.pushState({ screen: 'viewer' }, '');
  }
  
  loadVolumeAndPage();
}

// --- 6.5. 권수 레이블 및 정렬용 포맷터 ---
function formatVolumeName(volNum, title, unit = "권") {
  const num = Number(volNum);
  
  // 990 이상인 경우 번외/외전 처리
  if (num >= 990) {
    const base = Math.floor(num);
    const decimal = Math.round((num - base) * 100);
    return decimal > 0 ? `번외 ${decimal}` : `번외`;
  }

  const base = Math.floor(num);
  const decimal = Math.round((num - base) * 100);
  const tolerance = 0.001;
  const decDiff = num - base;
  
  if (decimal > 0) {
    // 0.05 단위 또는 일반 소수점 이하 두자리인 경우 (예: 3.01 -> 3부 1권)
    if (decimal % 10 !== 0 || decimal < 10) {
      return `${base}부 ${decimal}권`;
    }
    
    if (Math.abs(decDiff - 0.1) < tolerance) {
      return `${base}${unit} 상`;
    }
    if (Math.abs(decDiff - 0.2) < tolerance) {
      return `${base}${unit} 하`;
    }
    if (Math.abs(decDiff - 0.5) < tolerance) {
      return `${base}${unit} 외전`;
    }
  }
  
  if (Number.isInteger(num)) {
    return `${volNum}${unit}`;
  }
  const text = title || '';
  if (/(번외)/i.test(text)) return `${base}${unit} 번외`;
  if (/(외전)/i.test(text)) return `${base}${unit} 외전`;
  if (/(특별편)/i.test(text)) return `${base}${unit} 특별편`;
  if (/(부록)/i.test(text)) return `${base}${unit} 부록`;
  if (/(\bsp\b|\bextra\b|\bside\b|비하인드)/i.test(text)) return `${base}${unit} 외전`;
  return `${volNum}${unit}`;
}

// --- 7. 만화 페이지 렌더링 & 로딩 ---
async function loadVolumeAndPage() {
  const book = state.books.find(b => b.id === state.currentBookId);
  if (!book) return;
  
  // 선택한 볼륨이 없는 경우 보정
  if (!book.volumes[state.currentVolume]) {
    const availableVols = Object.keys(book.volumes).map(Number);
    state.currentVolume = availableVols.includes(1) ? 1 : availableVols[0];
  }
  
  const pages = book.volumes[state.currentVolume];
  
  // 페이지 범위 제한 검증
  if (state.currentPage < 1) state.currentPage = 1;
  if (state.currentPage > pages.length) state.currentPage = pages.length;
  
  // 헤더 권수 레이블 동기화
  DOM.currentVolumeLabel.textContent = formatVolumeName(state.currentVolume, book.volumeTitles?.[state.currentVolume], book.volumeUnits?.[state.currentVolume]);
  
  // 슬라이더 및 페이지 텍스트 정보 동기화
  DOM.viewerPageSlider.max = pages.length;
  DOM.viewerPageSlider.value = state.currentPage;
  updateGaugeProgress();
  
  // 로딩 시작
  showViewerLoader();
  resetZoom(); // 줌 상태 초기화
  
  DOM.comicImage.style.display = 'block';
  DOM.scrollContainer.style.display = 'none';
  
  const pageIndex = state.currentPage - 1;
  const pageUrl = await getPageUrl(book, state.currentVolume, pageIndex);
  
  if (pageUrl) {
    DOM.comicImage.src = pageUrl;
    DOM.comicImage.onload = () => {
      hideViewerLoader();
      preloadNextPage();
    };
    
    // 메모리 윈도우 관리 (앞뒤 N개 페이지 외에는 리소스를 해제하여 OOM 방어)
    manageMemoryWindow(book, state.currentVolume, pageIndex);
  } else {
    hideViewerLoader();
    alert("페이지 이미지를 불러오는데 실패했습니다.");
  }
  
  // 좌측 권수 이동 드롭다운 갱신
  renderVolumeDropdown(book);
  
  // 읽는 진도 저장
  saveProgress();
}

// --- 8. 뷰어 부가 세부 제어 기능 ---

// 좌측 권 이동 드롭다운 렌더링
function renderVolumeDropdown(book) {
  DOM.volumeDropdownList.innerHTML = '';
  Object.keys(book.volumes).sort((a, b) => Number(a) - Number(b)).forEach(volNum => {
    const isSelected = Number(volNum) === state.currentVolume;
    const btn = document.createElement('button');
    btn.className = `volume-item ${isSelected ? 'selected' : ''}`;
    
    const customTitle = book.volumeTitles?.[volNum] || '';
    const displayVol = formatVolumeName(volNum, customTitle, book.volumeUnits?.[volNum]);
    btn.textContent = customTitle ? `${displayVol}: ${customTitle}` : displayVol;
    
    btn.addEventListener('click', () => {
      DOM.volumeSelectorContainer.classList.remove('open');
      DOM.volumeDropdownList.classList.remove('active');
      state.currentVolume = Number(volNum);
      state.currentPage = 1; // 다른 권으로 갈 땐 1페이지부터 시작
      loadVolumeAndPage();
    });
    DOM.volumeDropdownList.appendChild(btn);
  });
}

// 게이지 진행률 및 라벨 갱신
function updateGaugeProgress() {
  const book = state.books.find(b => b.id === state.currentBookId);
  if (!book) return;
  const pages = book.volumes[state.currentVolume];
  const total = pages ? pages.length : 0;
  
  DOM.pageTextIndicator.textContent = `${state.currentPage} / ${total} 페이지`;
  
  const percentage = total > 1 ? ((state.currentPage - 1) / (total - 1)) * 100 : 0;
  DOM.gaugeProgress.style.width = `${percentage}%`;
}

// 뷰어 나가기 (서재 복귀)
function exitViewer(fromPopState = false) {
  saveProgress();
  
  // 현재 도서의 메모리 안전 해제
  const book = state.books.find(b => b.id === state.currentBookId);
  if (book) {
    // 1. 모든 volume의 모든 page blob url 명시적 해제
    Object.keys(book.volumes).forEach(volNum => {
      const pages = book.volumes[volNum];
      if (pages) {
        pages.forEach(page => {
          if (page && page.url) {
            URL.revokeObjectURL(page.url);
            page.url = null;
          }
        });
      }
    });

    // 2. ArchiveWrapper에 물려있는 jszip 및 원본 File 객체 해제
    if (book.archives) {
      Object.keys(book.archives).forEach(volNum => {
        const archive = book.archives[volNum];
        if (archive) {
          archive.jszip = null;
          archive.unarchiver = null;
          archive.fileOrBlob = null;
        }
      });
      book.archives = {}; // 아카이브 맵 비우기
    }
  }

  DOM.viewerScreen.classList.remove('active');
  DOM.libraryScreen.classList.add('active');
  state.currentBookId = null;
  renderBookshelf(); // 진행도 갱신을 위한 다시 렌더링

  // 브라우저의 뒤로가기 제스처가 아닌 홈 버튼을 수동으로 클릭해서 나가는 경우에만 history.back() 실행
  const isPop = fromPopState === true;
  if (!isPop && history.state?.screen === 'viewer') {
    history.back();
  }
}

// --- 9. LocalStorage 독서 진행 관리 로직 ---
function saveProgress() {
  if (!state.currentBookId) return;
  const progressData = {
    volume: state.currentVolume,
    page: state.currentPage
  };
  localStorage.setItem(`nkioi-bluberry-progress-${state.currentBookId}`, JSON.stringify(progressData));
}

function getSavedProgress(bookId) {
  const data = localStorage.getItem(`nkioi-bluberry-progress-${bookId}`);
  return data ? JSON.parse(data) : null;
}

// --- 11. 스마트 줌 & 팬 (Pinch Zoom & Drag Pan) 엔진 ---
function initZoomEngine() {
  const viewport = DOM.comicViewport;
  const img = DOM.comicImage;
  
  // 두 손가락 줌-팬 연동을 위한 좌표 상태
  let pinchStartCenterX = 0;
  let pinchStartCenterY = 0;
  let pinchStartPanX = 0;
  let pinchStartPanY = 0;
  
  // 마우스/터치 드래그 탐색 (Pan)
  viewport.addEventListener('mousedown', (e) => {
    if (state.zoomScale <= 1 || state.isFullscreen) return;
    state.isPanning = true;
    state.startX = e.clientX - state.panX;
    state.startY = e.clientY - state.panY;
    viewport.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', (e) => {
    if (!state.isPanning) return;
    state.panX = e.clientX - state.startX;
    state.panY = e.clientY - state.startY;
    applyTransform();
  });

  window.addEventListener('mouseup', () => {
    state.isPanning = false;
    viewport.style.cursor = 'default';
  });

  // 모바일 터치 제스처 (멀티터치 핀치 줌 & 팬)
  viewport.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      // 핀치 줌 스타트
      state.pinchStartDist = getTouchDistance(e.touches[0], e.touches[1]);
      state.pinchStartScale = state.zoomScale;
      
      // 두 손가락 터치 중심점 및 시작 기준 팬 좌표 기록
      pinchStartCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      pinchStartCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      pinchStartPanX = state.panX;
      pinchStartPanY = state.panY;
    } else if (e.touches.length === 1 && state.zoomScale > 1) {
      // 싱글터치 드래그 이동 (Pan)
      state.isPanning = true;
      state.startX = e.touches[0].clientX - state.panX;
      state.startY = e.touches[0].clientY - state.panY;
    }
  });

  viewport.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
      // 핀치 줌 스케일 변경
      const newDist = getTouchDistance(e.touches[0], e.touches[1]);
      if (state.pinchStartDist > 0) {
        const factor = newDist / state.pinchStartDist;
        state.zoomScale = Math.min(Math.max(state.pinchStartScale * factor, 1), 4); // 최대 4배 줌
        
        // 줌인 상태인 경우 두 손가락 움직임에 연동하여 팬(이동)도 동시 계산
        if (state.zoomScale > 1) {
          const currentCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          const currentCenterY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
          const deltaX = currentCenterX - pinchStartCenterX;
          const deltaY = currentCenterY - pinchStartCenterY;
          state.panX = pinchStartPanX + deltaX;
          state.panY = pinchStartPanY + deltaY;
        }
        
        applyTransform();
      }
    } else if (e.touches.length === 1 && state.isPanning) {
      // 팬 이동
      state.panX = e.touches[0].clientX - state.startX;
      state.panY = e.touches[0].clientY - state.startY;
      applyTransform();
    }
  });

  viewport.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) state.pinchStartDist = 0;
    if (e.touches.length === 0) state.isPanning = false;
  });

  // PC 데스크톱 웹 테스팅 편의를 위한 마우스 휠 줌 확장 지원 (Ctrl 키 동반 여부 무관 줌 인/아웃 허용)
  viewport.addEventListener('wheel', (e) => {
    if (state.viewMode === 'scroll') return; // 스크롤 모드에선 마우스 휠 본연 동작 보존
    e.preventDefault();
    const zoomFactor = 0.1;
    if (e.deltaY < 0) {
      state.zoomScale = Math.min(state.zoomScale + zoomFactor, 4);
    } else {
      state.zoomScale = Math.max(state.zoomScale - zoomFactor, 1);
    }
    if (state.zoomScale === 1) {
      state.panX = 0;
      state.panY = 0;
    }
    applyTransform();
  }, { passive: false });
}

function getTouchDistance(t1, t2) {
  return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
}

function applyTransform() {
  // 스케일 축소에 따른 팬 복귀 제한
  if (state.zoomScale <= 1) {
    state.zoomScale = 1;
    state.panX = 0;
    state.panY = 0;
  }
  DOM.comicImage.style.transform = `scale(${state.zoomScale}) translate(${state.panX / state.zoomScale}px, ${state.panY / state.zoomScale}px)`;
}

function resetZoom() {
  state.zoomScale = 1;
  state.panX = 0;
  state.panY = 0;
  applyTransform();
}

// --- 11.5. 구글 드라이브 통합 로직 ---
const GDrive = {
  clientId: localStorage.getItem('nkioi-gdrive-client-id') || '',
  apiKey: localStorage.getItem('nkioi-gdrive-api-key') || '',
  accessToken: localStorage.getItem('nkioi-gdrive-access-token') || '',
  tokenExpiry: Number(localStorage.getItem('nkioi-gdrive-token-expiry')) || 0,
  tokenClient: null,
  isGapiLoaded: false,
  isGisLoaded: false,
  pendingPickerOpen: false,
  lastFolderId: localStorage.getItem('nkioi-gdrive-last-folder-id') || 'root',
  nextPageToken: null,
  isLoadingMore: false,
  allFiles: [],
  globalComicFiles: [],
  isGlobalLoading: false
};

function loadGapiAndGis() {
  if (typeof gapi === 'undefined' || typeof google === 'undefined') {
    setTimeout(loadGapiAndGis, 300);
    return;
  }
  
  // 1. GAPI 로드
  gapi.load('client:picker', async () => {
    GDrive.isGapiLoaded = true;
    if (GDrive.apiKey) {
      gapi.client.setApiKey(GDrive.apiKey);
    }
    try {
      await gapi.client.load('https://www.googleapis.com/discovery/v1/apis/drive/v3/rest');
    } catch (err) {
      console.error("GAPI drive load failed:", err);
    }
    updateGDriveStatusUI();
  });

  // 2. GIS 토큰 클라이언트 초기화
  GDrive.isGisLoaded = true;
  initTokenClient();
}

function initTokenClient() {
  if (!GDrive.clientId || typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) return;
  
  GDrive.tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GDrive.clientId,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    callback: (response) => {
      if (response.error !== undefined) {
        console.error("OAuth error:", response);
        alert("구글 로그인 중 오류가 발생했습니다: " + response.error);
        return;
      }
      GDrive.accessToken = response.access_token;
      GDrive.tokenExpiry = Date.now() + (response.expires_in * 1000);
      localStorage.setItem('nkioi-gdrive-access-token', GDrive.accessToken);
      localStorage.setItem('nkioi-gdrive-token-expiry', GDrive.tokenExpiry);
      
      updateGDriveStatusUI();
      
      if (GDrive.pendingPickerOpen) {
        GDrive.pendingPickerOpen = false;
        openGooglePicker();
      }
    },
  });
}

function updateGDriveStatusUI() {
  const hasToken = !!GDrive.accessToken;
  const isExpired = GDrive.tokenExpiry ? Date.now() > GDrive.tokenExpiry : true;
  const isConnected = hasToken && !isExpired;
  
  if (DOM.gdriveStatusInfo) {
    if (isConnected) {
      DOM.gdriveStatusInfo.textContent = "상태: 연결됨 (로그인 완료)";
      DOM.gdriveStatusInfo.style.backgroundColor = "rgba(40, 167, 69, 0.08)";
      DOM.gdriveStatusInfo.style.color = "#28a745";
      
      if (DOM.btnGDriveLogin) DOM.btnGDriveLogin.style.display = 'none';
      if (DOM.btnGDriveLogout) DOM.btnGDriveLogout.style.display = 'block';
    } else {
      DOM.gdriveStatusInfo.textContent = GDrive.clientId && GDrive.apiKey ? "상태: 등록 완료 (로그인 필요)" : "상태: 연결되지 않음";
      DOM.gdriveStatusInfo.style.backgroundColor = "rgba(74, 114, 220, 0.05)";
      DOM.gdriveStatusInfo.style.color = "var(--text-secondary)";
      
      if (GDrive.clientId && GDrive.apiKey) {
        if (DOM.btnGDriveLogin) DOM.btnGDriveLogin.style.display = 'block';
      } else {
        if (DOM.btnGDriveLogin) DOM.btnGDriveLogin.style.display = 'none';
      }
      if (DOM.btnGDriveLogout) DOM.btnGDriveLogout.style.display = 'none';
    }
  }
  
  // 메인 화면 버튼 텍스트 변경
  const labelText = isConnected ? "구글 드라이브에서 가져오기" : "구글 드라이브 연결";
  if (DOM.btnLoadGDrive) {
    const span = DOM.btnLoadGDrive.querySelector('span');
    if (span) span.textContent = labelText;
  }
  const moreGDriveBtn = document.getElementById('btn-gdrive-more');
  if (moreGDriveBtn) {
    const span = moreGDriveBtn.querySelector('span');
    if (span) span.textContent = labelText;
  }
}

function openSettingsModal() {
  if (DOM.inputClientId) DOM.inputClientId.value = GDrive.clientId;
  if (DOM.inputApiKey) DOM.inputApiKey.value = GDrive.apiKey;
  updateGDriveStatusUI();
  DOM.settingsModal.classList.add('active');
}

function closeSettingsModal() {
  DOM.settingsModal.classList.remove('active');
}

function saveSettings() {
  const cid = DOM.inputClientId.value.trim();
  const key = DOM.inputApiKey.value.trim();
  
  if (!cid || !key) {
    alert("Client ID와 API Key를 모두 입력해 주세요.");
    return;
  }
  
  GDrive.clientId = cid;
  GDrive.apiKey = key;
  localStorage.setItem('nkioi-gdrive-client-id', cid);
  localStorage.setItem('nkioi-gdrive-api-key', key);
  
  // API 및 클라이언트 초기화 재시도
  if (typeof gapi !== 'undefined') {
    gapi.client.setApiKey(key);
  }
  initTokenClient();
  updateGDriveStatusUI();
  
  alert("설정이 저장되었습니다.");
}

function logoutGDrive() {
  if (GDrive.accessToken) {
    try {
      google.accounts.oauth2.revoke(GDrive.accessToken, () => {});
    } catch (e) {
      console.warn("OAuth revoke failed:", e);
    }
  }
  GDrive.accessToken = '';
  GDrive.tokenExpiry = 0;
  localStorage.removeItem('nkioi-gdrive-access-token');
  localStorage.removeItem('nkioi-gdrive-token-expiry');
  updateGDriveStatusUI();
  alert("연동이 해제되었습니다.");
}

async function handleGDriveButtonClick() {
  if (!GDrive.clientId || !GDrive.apiKey) {
    alert("먼저 우측 상단 ⚙️ 설정을 눌러 Client ID와 API Key를 등록해 주세요.");
    openSettingsModal();
    return;
  }
  
  const now = Date.now();
  if (GDrive.accessToken && GDrive.tokenExpiry > now + 60000) {
    openGooglePicker();
  } else {
    if (GDrive.tokenClient) {
      GDrive.pendingPickerOpen = true;
      try {
        GDrive.tokenClient.requestAccessToken({ prompt: '' });
      } catch (err) {
        GDrive.tokenClient.requestAccessToken({ prompt: 'consent' });
      }
    } else {
      alert("로그인 클라이언트가 초기화되지 않았습니다. 설정을 확인해 주세요.");
    }
  }
}

// 커스텀 피커 경로 히스토리
GDrive.folderPathHistory = [];

// 구글 드라이브 폴더의 실제 상위 경로(부모 폴더 트리)를 역추적하여 히스토리를 구성하는 헬퍼 함수
async function buildFolderPathHistory(folderId) {
  if (!folderId || folderId === 'root') {
    return [{ id: 'root', name: 'My Drive' }];
  }
  
  const history = [];
  let currentId = folderId;
  
  try {
    // 부모 폴더가 없을 때까지 또는 root에 도달할 때까지 최대 5단계 역추적
    let depth = 0;
    while (currentId && currentId !== 'root' && depth < 5) {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${currentId}?fields=name,parents`, {
        headers: {
          'Authorization': `Bearer ${GDrive.accessToken}`
        }
      });
      if (!response.ok) break;
      const data = await response.json();
      history.unshift({ id: currentId, name: data.name });
      currentId = (data.parents && data.parents.length > 0) ? data.parents[0] : null;
      depth++;
    }
  } catch (err) {
    console.error("상위 경로 역추적 중 에러:", err);
  }
  
  history.unshift({ id: 'root', name: 'My Drive' });
  return history;
}

async function openGooglePicker() {
  // 검색창 초기화
  const searchInput = document.getElementById('picker-search-input');
  if (searchInput) searchInput.value = '';
  const searchClear = document.getElementById('btn-clear-picker-search');
  if (searchClear) searchClear.style.display = 'none';

  GDrive.allFiles = [];
  GDrive.globalComicFiles = [];

  const lastId = GDrive.lastFolderId || 'root';
  
  DOM.gdrivePickerModal.classList.add('active');
  
  // 로딩 활성화 후 실제 구글 드라이브 상위 경로를 탐색해 브레드크럼을 완성합니다.
  const loader = DOM.pickerLoader;
  if (loader) loader.style.display = 'flex';
  
  GDrive.folderPathHistory = await buildFolderPathHistory(lastId);
  
  await loadFolderContents(lastId);
}

function updateBreadcrumb() {
  DOM.pickerBreadcrumb.innerHTML = '';
  GDrive.folderPathHistory.forEach((folder, idx) => {
    const span = document.createElement('span');
    span.className = 'breadcrumb-item';
    span.textContent = folder.name;
    span.dataset.folderId = folder.id;
    
    span.addEventListener('click', async () => {
      // 검색창 지우기
      const searchInput = document.getElementById('picker-search-input');
      if (searchInput) searchInput.value = '';
      const searchClear = document.getElementById('btn-clear-picker-search');
      if (searchClear) searchClear.style.display = 'none';

      // 클릭한 위치 이후의 히스토리 제거
      GDrive.folderPathHistory = GDrive.folderPathHistory.slice(0, idx + 1);
      await loadFolderContents(folder.id);
    });
    DOM.pickerBreadcrumb.appendChild(span);
  });
}

// 실시간 구글 서버 API 기반 검색 기능 구현 (이전 Abort 지원)
let currentSearchAbortController = null;

async function searchDriveFilesFromServer(keyword) {
  if (currentSearchAbortController) {
    currentSearchAbortController.abort();
  }
  currentSearchAbortController = new AbortController();
  const signal = currentSearchAbortController.signal;

  try {
    const escapedKeyword = keyword.replace(/'/g, "\\'");
    const q = `trashed = false and name contains '${escapedKeyword}' and (mimeType = 'application/zip' or mimeType = 'application/x-zip-compressed' or mimeType = 'application/x-zip' or mimeType = 'application/x-cbz' or mimeType = 'application/vnd.rar' or mimeType = 'application/x-rar-compressed' or name contains '.zip' or name contains '.cbz' or name contains '.rar' or name contains '.cbr')`;
    
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,modifiedTime)&pageSize=100`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${GDrive.accessToken}`
      },
      signal
    });

    if (!response.ok) {
      throw new Error(`검색 API 오류 (HTTP ${response.status})`);
    }

    const data = await response.json();
    return data.files || [];
  } catch (err) {
    if (err.name === 'AbortError') return null; // 중단된 비동기 요청 무시
    console.error("서버 검색 중 에러:", err);
    throw err;
  }
}

async function loadFolderContents(folderId) {
  const loader = DOM.pickerLoader;
  const list = DOM.pickerFileList;
  
  loader.style.display = 'flex';
  list.innerHTML = '';
  GDrive.allFiles = [];
  
  GDrive.lastFolderId = folderId;
  localStorage.setItem('nkioi-gdrive-last-folder-id', folderId);
  updateBreadcrumb();

  try {
    const q = `'${folderId}' in parents and trashed = false and (mimeType = 'application/vnd.google-apps.folder' or mimeType = 'application/zip' or mimeType = 'application/x-zip-compressed' or mimeType = 'application/x-zip' or mimeType = 'application/x-cbz' or mimeType = 'application/vnd.rar' or mimeType = 'application/x-rar-compressed' or name contains '.zip' or name contains '.cbz' or name contains '.rar' or name contains '.cbr')`;
    
    let nextPageToken = null;
    let accumulatedFiles = [];
    let loopCount = 0;
    
    // 최대 10페이지(1000개 파일)까지 끊김 없이 전체 목록을 동기적으로 다 받아옴
    do {
      let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,name,mimeType,size,modifiedTime)&orderBy=folder,name&pageSize=100`;
      if (nextPageToken) {
        url += `&pageToken=${encodeURIComponent(nextPageToken)}`;
      }
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${GDrive.accessToken}`
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          logoutGDrive();
          DOM.gdrivePickerModal.classList.remove('active');
          alert("구글 인증 세션이 만료되었습니다. 다시 로그인해 주세요.");
          return;
        }
        throw new Error(`API 오류 (HTTP ${response.status})`);
      }

      const data = await response.json();
      const files = data.files || [];
      accumulatedFiles.push(...files);
      
      nextPageToken = data.nextPageToken || null;
      loopCount++;
    } while (nextPageToken && loopCount < 10);

    GDrive.allFiles = accumulatedFiles;
    
    // 렌더링 함수 호출
    renderFilteredFileList();

  } catch (err) {
    console.error("폴더 목록 로드 실패:", err);
    list.innerHTML = `<li class="picker-empty-msg" style="color: #dc3545;">목록 로드 중 오류가 발생했습니다.<br>${err.message}</li>`;
  } finally {
    loader.style.display = 'none';
  }
}

// 브라우저 내부에서 실시간으로 정렬을 수행하는 렌더 엔진 (폴더 탐색용)
function renderFilteredFileList() {
  const list = DOM.pickerFileList;
  if (!list) return;
  
  list.innerHTML = '';
  
  const sortVal = DOM.pickerSortSelect ? DOM.pickerSortSelect.value : 'folder,name';
  const filtered = GDrive.allFiles;

  if (filtered.length === 0) {
    list.innerHTML = `<li class="picker-empty-msg">이 폴더에 지원되는 만화책 파일이 없습니다.</li>`;
    return;
  }

  // 2. 정렬 (폴더 우선, 그 후 옵션에 따라 이름 오름/내림, 수정 오름/내림)
  filtered.sort((a, b) => {
    const isFolderA = a.mimeType === 'application/vnd.google-apps.folder';
    const isFolderB = b.mimeType === 'application/vnd.google-apps.folder';
    
    if (isFolderA && !isFolderB) return -1;
    if (!isFolderA && isFolderB) return 1;
    
    if (sortVal === 'folder,name desc') {
      return b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' });
    } else if (sortVal === 'folder,modifiedTime desc') {
      const timeA = a.modifiedTime ? new Date(a.modifiedTime).getTime() : 0;
      const timeB = b.modifiedTime ? new Date(b.modifiedTime).getTime() : 0;
      return timeB - timeA;
    } else if (sortVal === 'folder,modifiedTime asc') {
      const timeA = a.modifiedTime ? new Date(a.modifiedTime).getTime() : 0;
      const timeB = b.modifiedTime ? new Date(b.modifiedTime).getTime() : 0;
      return timeA - timeB;
    } else {
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    }
  });

  // 3. 목록 동적 추가
  filtered.forEach(file => {
    const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
    const li = document.createElement('li');
    li.className = 'picker-item';
    
    const icon = isFolder ? '📁' : '📚';
    
    let sizeStr = '';
    if (!isFolder && file.size) {
      const sizeBytes = parseInt(file.size, 10);
      if (sizeBytes > 1024 * 1024) {
        sizeStr = `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
      } else {
        sizeStr = `${(sizeBytes / 1024).toFixed(0)} KB`;
      }
    }

    li.innerHTML = `
      <div class="picker-icon">${icon}</div>
      <div class="picker-name-wrapper">
        <div class="picker-item-name" title="${file.name}">${file.name}</div>
        ${sizeStr ? `<div class="picker-item-size">${sizeStr}</div>` : ''}
      </div>
    `;

    li.addEventListener('click', async () => {
      if (isFolder) {
        GDrive.folderPathHistory.push({ id: file.id, name: file.name });
        await loadFolderContents(file.id);
      } else {
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        const fileSizeLimit = 500 * 1024 * 1024;
        
        if (isMobile && file.size && parseInt(file.size, 10) > fileSizeLimit) {
          const sizeMB = (parseInt(file.size, 10) / (1024 * 1024)).toFixed(0);
          const proceed = confirm(`[대용량 파일 경고]\n\n선택하신 파일의 크기가 ${sizeMB}MB로 매우 큽니다.\n\n모바일 브라우저의 메모리 한계로 인해 다운로드 중 앱이 튕기거나 새로고침될 수 있습니다. 계속 다운로드를 진행하시겠습니까?`);
          if (!proceed) return;
        }

        DOM.gdrivePickerModal.classList.remove('active');
        await handleGDriveFileDownload(file.id, file.name);
      }
    });

    list.appendChild(li);
  });
}

// 실시간 구글 서버 API 검색 결과를 렌더링하는 전용 렌더러
function renderServerSearchResults(files) {
  const list = DOM.pickerFileList;
  if (!list) return;
  
  list.innerHTML = '';
  
  if (!files || files.length === 0) {
    list.innerHTML = `<li class="picker-empty-msg">검색 결과와 일치하는 파일이 없습니다.</li>`;
    return;
  }
  
  const sortVal = DOM.pickerSortSelect ? DOM.pickerSortSelect.value : 'folder,name';

  files.sort((a, b) => {
    if (sortVal === 'folder,name desc') {
      return b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' });
    } else if (sortVal === 'folder,modifiedTime desc') {
      const timeA = a.modifiedTime ? new Date(a.modifiedTime).getTime() : 0;
      const timeB = b.modifiedTime ? new Date(b.modifiedTime).getTime() : 0;
      return timeB - timeA;
    } else if (sortVal === 'folder,modifiedTime asc') {
      const timeA = a.modifiedTime ? new Date(a.modifiedTime).getTime() : 0;
      const timeB = b.modifiedTime ? new Date(b.modifiedTime).getTime() : 0;
      return timeA - timeB;
    } else {
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    }
  });

  files.forEach(file => {
    const li = document.createElement('li');
    li.className = 'picker-item';
    
    let sizeStr = '';
    if (file.size) {
      const sizeBytes = parseInt(file.size, 10);
      if (sizeBytes > 1024 * 1024) {
        sizeStr = `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
      } else {
        sizeStr = `${(sizeBytes / 1024).toFixed(0)} KB`;
      }
    }

    li.innerHTML = `
      <div class="picker-icon">📚</div>
      <div class="picker-name-wrapper">
        <div class="picker-item-name" title="${file.name}">${file.name}</div>
        ${sizeStr ? `<div class="picker-item-size">${sizeStr}</div>` : ''}
      </div>
    `;

    li.addEventListener('click', async () => {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const fileSizeLimit = 500 * 1024 * 1024;
      
      if (isMobile && file.size && parseInt(file.size, 10) > fileSizeLimit) {
        const sizeMB = (parseInt(file.size, 10) / (1024 * 1024)).toFixed(0);
        const proceed = confirm(`[대용량 파일 경고]\n\n선택하신 파일의 크기가 ${sizeMB}MB로 매우 큽니다.\n\n모바일 브라우저의 메모리 한계로 인해 다운로드 중 앱이 튕기거나 새로고침될 수 있습니다. 계속 다운로드를 진행하시겠습니까?`);
        if (!proceed) return;
      }

      DOM.gdrivePickerModal.classList.remove('active');
      await handleGDriveFileDownload(file.id, file.name);
    });

    list.appendChild(li);
  });
}

async function handleGDriveFileDownload(fileId, fileName) {
  showLoader(`구글 드라이브에서 파일 다운로드 중...\n(${fileName}) - 0%`);
  try {
    const blob = await downloadGDriveFile(fileId, (percent) => {
      showLoader(`구글 드라이브에서 파일 다운로드 중...\n(${fileName}) - ${percent}%`);
    });
    let finalName = fileName;
    if (!/\.(zip|cbz|rar|cbr)$/i.test(finalName)) {
      finalName += '.zip';
    }
    const fileObject = new File([blob], finalName, { type: blob.type });
    await processUploadedFiles([fileObject]);
  } catch (err) {
    console.error("파일 다운로드 실패:", err);
    alert("파일을 가져오는데 실패했습니다: " + err.message);
  } finally {
    hideLoader();
  }
}

function downloadGDriveFile(fileId, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    
    xhr.open('GET', url, true);
    xhr.setRequestHeader('Authorization', `Bearer ${GDrive.accessToken}`);
    xhr.responseType = 'blob';
    
    xhr.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    };
    
    xhr.onload = () => {
      if (xhr.status === 200) {
        resolve(xhr.response);
      } else {
        reject(new Error(`다운로드 실패 (HTTP ${xhr.status})`));
      }
    };
    
    xhr.onerror = () => {
      reject(new Error("네트워크 오류로 다운로드에 실패했습니다."));
    };
    
    xhr.send();
  });
}

// --- 12. 전체 이벤트 핸들러 & 바인딩 ---
function initEventListeners() {
  // A. 만화책 불러오기 버튼 클릭 바인딩
  DOM.btnLoadComics.addEventListener('click', () => DOM.comicsFileInput.click());
  DOM.comicsFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      processUploadedFiles(e.target.files);
      e.target.value = ''; // 연속해서 추가 업로드하거나 동일한 파일을 다시 올려도 정상 작동하도록 값 초기화
    }
  });

  // B. 3분할 터치 스위치 이벤트 정의
  DOM.touchLeft.addEventListener('click', () => {
    if (state.viewMode !== 'slide' || state.zoomScale > 1) return;
    if (state.currentPage > 1) {
      state.currentPage--;
      loadVolumeAndPage();
    }
  });

  DOM.touchRight.addEventListener('click', () => {
    if (state.viewMode !== 'slide' || state.zoomScale > 1) return;
    const book = state.books.find(b => b.id === state.currentBookId);
    if (!book) return;
    const maxPages = book.volumes[state.currentVolume].length;
    
    if (state.currentPage < maxPages) {
      state.currentPage++;
      loadVolumeAndPage();
    }
  });

  DOM.touchCenter.addEventListener('click', () => {
    state.isFullscreen = !state.isFullscreen;
    if (state.isFullscreen) {
      DOM.appContainer.classList.add('fullscreen-active');
    } else {
      DOM.appContainer.classList.remove('fullscreen-active');
    }
  });

  // C. 홈 복귀 & 조작바 바인딩
  DOM.btnBackHome.addEventListener('click', exitViewer);
  
  // D. 권수(Volume) 선택 모달 제어
  DOM.btnVolumeSelect.addEventListener('click', (e) => {
    e.stopPropagation();
    DOM.volumeSelectorContainer.classList.toggle('open');
    DOM.volumeDropdownList.classList.toggle('active');
  });

  window.addEventListener('click', () => {
    DOM.volumeSelectorContainer.classList.remove('open');
    DOM.volumeDropdownList.classList.remove('active');
  });

  // E. 구글 드라이브 설정 및 기능 바인딩
  if (DOM.btnOpenSettings) DOM.btnOpenSettings.addEventListener('click', openSettingsModal);
  if (DOM.btnCloseSettings) DOM.btnCloseSettings.addEventListener('click', closeSettingsModal);
  if (DOM.btnSaveSettings) DOM.btnSaveSettings.addEventListener('click', saveSettings);
  if (DOM.btnGDriveLogin) DOM.btnGDriveLogin.addEventListener('click', () => {
    if (GDrive.tokenClient) GDrive.tokenClient.requestAccessToken({ prompt: 'consent' });
  });
  if (DOM.btnGDriveLogout) DOM.btnGDriveLogout.addEventListener('click', logoutGDrive);
  if (DOM.btnLoadGDrive) DOM.btnLoadGDrive.addEventListener('click', handleGDriveButtonClick);
  if (DOM.btnClosePicker) DOM.btnClosePicker.addEventListener('click', () => {
    DOM.gdrivePickerModal.classList.remove('active');
  });

  // 검색창 실시간 필터링 이벤트 추가 (실시간 구글 서버 비동기 검색 및 디바운스 기법 적용)
  const searchInput = document.getElementById('picker-search-input');
  const searchClear = document.getElementById('btn-clear-picker-search');
  let searchDebounceTimeout = null;

  if (searchInput && searchClear) {
    searchInput.addEventListener('input', (e) => {
      const keyword = e.target.value.trim();
      searchClear.style.display = keyword ? 'flex' : 'none';
      
      if (searchDebounceTimeout) clearTimeout(searchDebounceTimeout);

      if (!keyword) {
        renderFilteredFileList();
        return;
      }

      searchDebounceTimeout = setTimeout(async () => {
        try {
          const files = await searchDriveFilesFromServer(keyword);
          if (files !== null) {
            renderServerSearchResults(files);
          }
        } catch (err) {
          DOM.pickerFileList.innerHTML = `<li class="picker-empty-msg" style="color: #dc3545;">검색에 실패했습니다:<br>${err.message}</li>`;
        }
      }, 300);
    });

    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      searchInput.focus();
      searchClear.style.display = 'none';
      renderFilteredFileList();
    });
  }

  // 정렬 셀렉트 박스 변경 이벤트 추가
  if (DOM.pickerSortSelect) {
    DOM.pickerSortSelect.addEventListener('change', () => {
      const keyword = searchInput ? searchInput.value.trim() : '';
      if (keyword) {
        searchInput.dispatchEvent(new Event('input'));
      } else {
        renderFilteredFileList();
      }
    });
  }

  // G. 하단 게이지 바 터치/드래그 즉시 네비게이션 제어
  DOM.viewerPageSlider.addEventListener('input', (e) => {
    state.currentPage = parseInt(e.target.value, 10);
    updateGaugeProgress();
  });

  DOM.viewerPageSlider.addEventListener('change', (e) => {
    state.currentPage = parseInt(e.target.value, 10);
    loadVolumeAndPage();
  });

  // H. 이어보기 모달 버튼들 제어
  DOM.btnReadStart.addEventListener('click', () => {
    startReading(1, 1);
  });

  DOM.btnReadResume.addEventListener('click', () => {
    const progress = getSavedProgress(state.currentBookId);
    if (progress) {
      startReading(progress.volume, progress.page);
    } else {
      startReading(1, 1);
    }
  });

  // I. 뒤로가기 제스처(popstate) 제어
  window.addEventListener('popstate', (event) => {
    // 뷰어가 켜져있고 책이 선택된 상태에서 뒤로가기가 발생하면, 책을 덮고 서재로 안전하게 나감
    if (state.currentBookId && DOM.viewerScreen.classList.contains('active')) {
      exitViewer(true);
    }
  });
}

// --- 13. 범용 UI 로더 애니메이션 제어 ---
function showLoader(message = "분석 중...") {
  const tip = document.querySelector('.upload-tip');
  if (tip) {
    tip.textContent = message;
    tip.style.display = 'block';
  }

  const addMoreTip = document.querySelector('.add-more-tip');
  const btnLoadMore = document.getElementById('btn-load-more');
  if (addMoreTip) {
    addMoreTip.textContent = message;
    addMoreTip.style.display = 'block';
  }
  if (btnLoadMore) {
    btnLoadMore.disabled = true;
    btnLoadMore.style.opacity = '0.6';
  }
}

function hideLoader() {
  const tip = document.querySelector('.upload-tip');
  if (tip) {
    tip.textContent = '';
    tip.style.display = 'none';
  }

  const addMoreTip = document.querySelector('.add-more-tip');
  const btnLoadMore = document.getElementById('btn-load-more');
  if (addMoreTip) {
    addMoreTip.style.display = 'none';
    addMoreTip.textContent = '';
  }
  if (btnLoadMore) {
    btnLoadMore.disabled = false;
    btnLoadMore.style.opacity = '1';
  }
}

function showViewerLoader() {
  if (viewerLoaderTimeout) clearTimeout(viewerLoaderTimeout);
  viewerLoaderTimeout = setTimeout(() => {
    DOM.viewerLoader.classList.add('active');
  }, 200);
}

function hideViewerLoader() {
  if (viewerLoaderTimeout) {
    clearTimeout(viewerLoaderTimeout);
    viewerLoaderTimeout = null;
  }
  DOM.viewerLoader.classList.remove('active');
}

// 이전/다음 만화 페이지 백그라운드 프리로드 기능 (온디맨드 연동)
async function preloadNextPage() {
  const book = state.books.find(b => b.id === state.currentBookId);
  if (!book) return;
  const pages = book.volumes[state.currentVolume];
  if (!pages) return;
  
  // 다음 페이지 프리로드 (비동기 해제 호출)
  if (state.currentPage < pages.length) {
    getPageUrl(book, state.currentVolume, state.currentPage);
  }
  // 이전 페이지 프리로드
  if (state.currentPage > 1) {
    getPageUrl(book, state.currentVolume, state.currentPage - 2);
  }
}

// 전역 예외 발생 시 로더 강제 닫기 (외부 압축 해제 라이브러리 크래시 방어용)
window.addEventListener('error', (event) => {
  console.error("전역 에러 감지:", event.error);
  hideLoader();
});

window.addEventListener('unhandledrejection', (event) => {
  console.error("처리되지 않은 프로미스 거부 감지:", event.reason);
  hideLoader();
});

// --- 14. 초기 실행 진입점 ---
window.addEventListener('DOMContentLoaded', () => {
  console.log("나교이 만화가게 v1.0.4 - 블루베리 에디션 로드 완료!");
  initEventListeners();
  initZoomEngine();
  renderBookshelf();
  loadGapiAndGis();

  // 서비스 워커 등록 (PWA 전체화면 앱 지원)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('서비스 워커가 정상 등록되었습니다.', reg))
      .catch(err => console.error('서비스 워커 등록 실패:', err));
  }
});
