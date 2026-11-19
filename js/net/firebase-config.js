/*
 * Firebase 설정 (여러 기기에서 함께 접속할 때)
 * ------------------------------------------------------------
 * 비워 두면(null) 서버 없이 '같은 컴퓨터의 여러 탭'끼리만 함께 보이는 시험 모드로 돌아갑니다.
 * Firebase 콘솔 → 프로젝트 설정 → 내 앱(웹) 의 firebaseConfig 값을 그대로 붙여 넣고,
 * databaseURL(실시간 데이터베이스 주소)이 들어 있는지 확인하세요. 자세한 순서: docs/firebase-setup.md
 *
 * 웹용 Firebase 설정값은 브라우저에 그대로 전달되는 공개 식별자라 비밀번호가 아닙니다.
 * 대신 데이터베이스 규칙(database.rules.json)으로 쓸 수 있는 내용을 제한합니다.
 */
window.MP_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCijUnH2mShxQDoqZW_A6vqNYHl5rd5HrQ',
  authDomain: 'makepark-cea3c.firebaseapp.com',
  databaseURL: 'https://makepark-cea3c-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'makepark-cea3c',
  storageBucket: 'makepark-cea3c.firebasestorage.app',
  messagingSenderId: '505405728286',
  appId: '1:505405728286:web:fe5f60b752422ae9d0b00f'
};
/* 예)
window.MP_FIREBASE_CONFIG = {
  apiKey: '...',
  authDomain: 'makepark-xxxx.firebaseapp.com',
  databaseURL: 'https://makepark-xxxx-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'makepark-xxxx',
  appId: '...'
};
*/
