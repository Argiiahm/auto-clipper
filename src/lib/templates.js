export const PROMPT_TEMPLATES = [
  {
    id: 'viral',
    label: 'Viral & Hook',
    icon: 'Flame',
    badge: 'Populer',
    desc: 'Momen berenergi tinggi, hook 3 detik pertama, dan retensi maksimal.',
    instruction: 'Prioritize high-energy hooks, shocking revelations, climaxes, and moments that immediately grab attention within the first 3 seconds with a satisfying payoff.',
    placeholder: 'Opsional: misal "Fokus bagian yang paling heboh dan bikin penasaran"',
  },
  {
    id: 'meme',
    label: 'Meme & Komedi',
    icon: 'Laugh',
    badge: 'Meme',
    desc: 'Momen kocak, blunder, ekspresi konyol, roasting, dan bahan meme viral.',
    instruction: 'Prioritize hilarious moments, funny jokes, laughing fits, blunders, awkward silences, out-of-context quotes, sarcastic roasts, and funny reactions that have high meme potential on TikTok and Reels.',
    placeholder: 'Opsional: misal "Cari momen pas dia ngelawak, roasting, atau salah ngomong"',
  },
  {
    id: 'education',
    label: 'Edukasi & Insight',
    icon: 'Lightbulb',
    badge: 'Edukasi',
    desc: 'Tips praktis, rahasia sukses, fakta baru, dan insight bernilai tinggi.',
    instruction: 'Prioritize high-value educational insights, actionable advice, life hacks, surprising knowledge, mindset shifts, and clear explanations that make viewers feel they learned something valuable in under 90 seconds.',
    placeholder: 'Opsional: misal "Cari tips praktis dan penjelasan strategi penting"',
  },
  {
    id: 'debate',
    label: 'Debat & Kontroversi',
    icon: 'Zap',
    badge: 'Diskusi',
    desc: 'Adu opini panas, perbedaan sudut pandang, dan memicu komentar penonton.',
    instruction: 'Prioritize heated arguments, conflicting perspectives, controversial hot takes, sharp disagreements, and bold opinions that naturally provoke intense viewer discussion in the comments.',
    placeholder: 'Opsional: misal "Cari perdebatan sengit tentang topik kontroversial"',
  },
  {
    id: 'story',
    label: 'Cerita & Emosional',
    icon: 'BookOpen',
    badge: 'Kisah',
    desc: 'Kisah hidup dramatis, perjuangan, momen haru, dan motivasi inspiratif.',
    instruction: 'Prioritize dramatic storytelling, personal struggles, heartwarming moments, vulnerability, life lessons, and inspiring climaxes with powerful emotional resonance.',
    placeholder: 'Opsional: misal "Cari cerita masa lalu atau perjuangannya yang sedih"',
  },
  {
    id: 'podcast_gold',
    label: 'Deep Talk & Filosofi',
    icon: 'Mic',
    badge: 'Podcast',
    desc: 'Percakapan mendalam, renungan hidup, dan pertanyaan filosofis.',
    instruction: 'Prioritize deep conversations, philosophical thoughts, intimate reflections, thought-provoking questions, and vulnerable confessions that make viewers pause and think.',
    placeholder: 'Opsional: misal "Cari obrolan mendalam tentang makna hidup atau masa depan"',
  },
  {
    id: 'custom',
    label: 'Kustom Mandiri',
    icon: 'Sparkles',
    badge: 'Bebas',
    desc: 'Tulis instruksi khusus sendiri untuk mencari momen spesifik yang Anda inginkan.',
    instruction: '',
    placeholder: 'Tulis prompt bebas: misal "Cari bagian saat mereka membahas investasi kripto & saham"',
  },
];

export function getTemplate(id) {
  return PROMPT_TEMPLATES.find((t) => t.id === id) || PROMPT_TEMPLATES[0];
}
