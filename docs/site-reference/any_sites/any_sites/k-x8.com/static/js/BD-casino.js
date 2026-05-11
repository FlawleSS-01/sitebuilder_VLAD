(function () {

  /* ===== 数据（你以后只改这里）===== */
  const DATA = {
    title: "Top Online Gaming Platforms in Bangladesh – 2026",
    desc: "Browse our full list of the top Jili Games betting sites in Bangladesh for 2026, compiled based on ratings and specific features.",
    cards: [
      {
        name: "DK Game",
        logo: "https://k-x8.com/static/image/dk.gif",
        bonus: "Grab $1,744 + 150 Free Spins today!",
        url: "https://dkgg01.dkdxaa.com/register"
      },
      {
        name: "CTG777",
        logo: "https://k-x8.com/static/image/ctg.gif",
        bonus: "🚀 82% Bonus — Don’t Miss!",
        url: "https://jizhua1.ctg777.online/register"
      },
      {
        name: "DHK888",
        logo: "https://k-x8.com/static/image/dhk.gif",
        bonus: "💸 Login & Get 7777 Daily!",
        url: "https://jizhua1.dhk888.xyz/register"
      },
      {
        name: "3K777",
        logo: "https://k-x8.com/static/image/3k.gif",
        bonus: "🔥 Invite & Earn 7777 Taka!",
        url: "https://jizhua1.3k777.me/register"
      },
      {
        name: "OKGO777",
        logo: "https://k-x8.com/static/image/okgo.gif",
        bonus: "🎁 50% Bonus — Grab Now!",
        url: "https://okgo4aa.com/#/register?referCode=753589358672&inviteType=INVITE_ROULETTE"
      }
      // {
      //   name: "黃金廣告位招租",
      //   logo: "https://k-x8.com/static/image/ggw.gif",
      //   bonus: "本站優質廣告位招租中",
      //   url: "https://t.me/faf688"
      // },
      // {
      //   name: "黃金廣告位招租",
      //   logo: "https://k-x8.com/static/image/ggw.gif",
      //   bonus: "本站優質廣告位招租中",
      //   url: "https://t.me/faf688"
      // }
    ]
  };

  /* ===== CSS 注入 ===== */
  function injectCSS() {
    if (document.getElementById("uz-style")) return;

    const css = `
      .uz-wrap{background:#0b0b0b;color:#fff;padding:20px;border-radius:10px}
      .uz-title{font-size:28px;font-weight:800;margin:0 0 8px}
      .uz-desc{opacity:.8;margin-bottom:18px}
      .uz-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
      @media(max-width:1000px){.uz-grid{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:520px){.uz-grid{grid-template-columns:1fr}}

      .uz-card{background:#141414;border-radius:8px;overflow:hidden}
      .uz-logo{height:200px;display:flex;align-items:center;justify-content:center}
      .uz-logo img{max-width:85%;max-height:100%}
      .uz-body{padding:12px}
      .uz-name{font-size:20px;font-weight:800;margin-bottom:6px}
      .uz-bonus{font-size:18px;font-weight:800;margin-bottom:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

      .uz-btn{
        display:block;text-align:center;
        background:#6ea91a;color:#fff;
        padding:10px;border-radius:4px;
        font-size:18px;font-weight:800;
        text-decoration:none
      }
      .uz-note{margin-top:8px;font-size:13px;opacity:.85}
    `;

    const style = document.createElement("style");
    style.id = "uz-style";
    style.innerHTML = css;
    document.head.appendChild(style);
  }

  /* ===== 数组随机打乱 ===== */
  function shuffleArray(arr) {
    const newArr = [...arr];
    for (let i = newArr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
    }
    return newArr;
  }

  /* ===== HTML 生成 ===== */
  function createHTML() {
    let cardsHTML = "";
    const randomCards = shuffleArray(DATA.cards);

    randomCards.forEach(c => {
      cardsHTML += `
        <div class="uz-card">
          <div class="uz-logo">
            <img src="${c.logo}" alt="${c.name}">
          </div>
          <div class="uz-body">
            <div class="uz-name">${c.name}</div>
            <div class="uz-bonus">${c.bonus}</div>
            <a class="uz-btn" href="${c.url}" target="_blank" rel="nofollow noopener noreferrer">Get Bonus ↗</a>
            <div class="uz-note">18+ | Play Responsibly ✅</div>
          </div>
        </div>
      `;
    });

    return `
      <section class="uz-wrap">
        <h2 class="uz-title">${DATA.title}</h2>
        <div class="uz-desc">${DATA.desc}</div>
        <div class="uz-grid">
          ${cardsHTML}
        </div>
      </section>
    `;
  }

  /* ===== 对外方法 ===== */
  window.renderUzCasino = function (options) {
    const mount = document.getElementById(options.mountId);
    if (!mount) return;

    injectCSS();
    mount.innerHTML = createHTML();
  };

})();