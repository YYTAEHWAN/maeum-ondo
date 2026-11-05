// 저장소 어댑터
// 앱은 load()/save()만 사용한다. 나중에 서버나 클라우드로 바꾸고 싶으면
// 같은 모양의 어댑터(예: serverAdapter)를 만들고 store.js에서 교체하면 된다.

const KEY = 'maeum-ondo-v1';

export const localAdapter = {
  async load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  async save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  },
};
