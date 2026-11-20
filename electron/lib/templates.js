const PROMPT_TEMPLATES = [
  {
    id: 'viral',
    label: 'Viral & Hook',
    badge: 'Populer',
    desc: 'Momen berenergi tinggi, hook 3 detik pertama, dan retensi maksimal.',
    instruction: 'Prioritize high-energy hooks, shocking revelations, climaxes, and moments that immediately grab attention within the first 3 seconds with a satisfying payoff.',
    example: 'Fokus bagian yang paling heboh dan bikin penasaran',
  },
  {
    id: 'meme',
    label: 'Meme & Komedi',
    badge: 'Meme',
    desc: 'Momen kocak, blunder, ekspresi konyol, roasting, dan bahan meme viral.',
    instruction: 'Prioritize hilarious moments, funny jokes, laughing fits, blunders, awkward silences, out-of-context quotes, sarcastic roasts, and funny reactions that have high meme potential on TikTok and Reels.',
    example: 'Cari momen pas dia ngelawak, roasting, atau salah ngomong',
  },
  {
    id: 'education',
    label: 'Edukasi & Insight',
    badge: 'Edukasi',
    desc: 'Tips praktis, rahasia sukses, fakta baru, dan insight bernilai tinggi.',
    instruction: 'Prioritize high-value educational insights, actionable advice, life hacks, surprising knowledge, mindset shifts, and clear explanations that make viewers feel they learned something valuable in under 90 seconds.',
    example: 'Cari tips praktis dan penjelasan strategi penting',
  },
  {
    id: 'debate',
    label: 'Debat & Kontroversi',
    badge: 'Diskusi',
    desc: 'Adu opini panas, perbedaan sudut pandang, dan memicu komentar penonton.',
    instruction: 'Prioritize heated arguments, conflicting perspectives, controversial hot takes, sharp disagreements, and bold opinions that naturally provoke intense viewer discussion in the comments.',
    example: 'Cari perdebatan sengit tentang topik kontroversial',
  },
  {
    id: 'story',
    label: 'Cerita & Emosional',
    badge: 'Kisah',
    desc: 'Kisah hidup dramatis, perjuangan, momen haru, dan motivasi inspiratif.',
    instruction: 'Prioritize dramatic storytelling, personal struggles, heartwarming moments, vulnerability, life lessons, and inspiring climaxes with powerful emotional resonance.',
    example: 'Cari cerita perjuangan atau masa lalu yang mengharukan',
  },
  {
    id: 'podcast_gold',
    label: 'Deep Talk & Filosofi',
    badge: 'Podcast',
    desc: 'Percakapan mendalam, renungan hidup, dan pertanyaan filosofis.',
    instruction: 'Prioritize deep conversations, philosophical thoughts, intimate reflections, thought-provoking questions, and vulnerable confessions that make viewers pause and think.',
    example: 'Cari obrolan mendalam tentang makna hidup atau masa depan',
  },
  {
    id: 'custom',
    label: 'Kustom Mandiri',
    badge: 'Bebas',
    desc: 'Tulis instruksi khusus sendiri untuk mencari momen spesifik yang Anda inginkan.',
    instruction: '',
    example: 'Tulis prompt bebas sesuai keinginan Anda',
  },
];

function getTemplate(id) {
  return PROMPT_TEMPLATES.find((t) => t.id === id) || PROMPT_TEMPLATES[0];
}

module.exports = { PROMPT_TEMPLATES, getTemplate };
