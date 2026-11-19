export const api = window.api || {
  call: async () => { throw new Error('Electron API tidak tersedia'); }, on: () => () => {}, fileUrl: (p) => p, join: (...a) => a.join('/'), platform: 'web',
};
export const call = (...a) => api.call(...a);
export const fileUrl = (p) => api.fileUrl(p);
