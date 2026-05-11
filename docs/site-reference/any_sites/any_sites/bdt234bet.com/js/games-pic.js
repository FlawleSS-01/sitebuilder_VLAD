// Games functionality
class GamesManager {
    constructor() {
        this.games = [];
        this.currentFilter = 'all';
        this.currentSort = 'popularity';
        this.currentTheme = 'all';
        this.visibleGames = 12;
        this.init();
    }

    init() {
        this.loadGames();
        this.setupEventListeners();
        this.detectPageType();
        this.renderGames();
    }

    detectPageType() {
        const path = window.location.pathname;
        const urlParams = new URLSearchParams(window.location.search);
        
        if (path.includes('slots.html')) {
            this.pageType = 'slots';
            this.currentFilter = 'slot';
        } else if (path.includes('games.html')) {
            this.pageType = 'games';
            // Проверяем параметр фильтра в URL
            const filterParam = urlParams.get('filter');
            this.currentFilter = filterParam || 'all';
        } else {
            this.pageType = 'main';
            this.currentFilter = 'all';
        }
    }

    loadGames() {
        // Games data with priorities and categories
        this.games = [
            // Casino games (for main page)
            {
                id: 'aviator',
                name: 'Aviator',
                category: 'crash',
                type: 'Crash Game',
                image: 'img/games-pic/casino/aviator-crash-game-by-spribe.webp',
                alt: 'Take to the skies with Aviator, the thrilling crash game by Spribe. The iconic red plane logo promises high-flying excitement and increasing multiplier wins.',
                priority: 1,
                time: '~2-3 min',
                popular: true,
                theme: 'crash',
                isNew: false
            },
            {
                id: '3-pots-egypt',
                name: '3 Pots of Egypt',
                category: 'slot',
                type: 'Hold & Win Slot',
                image: 'img/games-pic/casino/3-pots-of-egypt-hold-and-win-slot.webp',
                alt: 'Discover the riches of ancient Egypt in the 3 Pots of Egypt slot. Three colorful pots overflowing with gold coins promise a thrilling Hold and Win adventure.',
                priority: 2,
                time: '~3-5 min',
                popular: false,
                theme: 'egyptian',
                isNew: false
            },
            {
                id: 'magic-ace',
                name: 'Magic Ace',
                category: 'slot',
                type: 'Wild Lock Slot',
                image: 'img/games-pic/casino/magic-ace-wild-lock-slot-game.webp',
                alt: 'Experience the magic of the circus in Magic Ace Wild Lock. This colorful slot features a special wild card with a jester hat, offering wins up to 2600x your bet.',
                priority: 3,
                time: '~5-7 min',
                popular: false,
                theme: 'fantasy',
                isNew: false
            },
            {
                id: 'dragon-demons',
                name: 'Dragon of Demons',
                category: 'slot',
                type: 'Fantasy Slot',
                image: 'img/games-pic/casino/dragon-of-demons-fantasy-slot.webp',
                alt: 'Face a fearsome beast in the Dragon of Demons slot. This powerful dragon with golden armor guards untold riches in a dark, mystical world full of fantasy and danger.',
                priority: 4,
                time: '~5-8 min',
                popular: false,
                theme: 'fantasy',
                isNew: false
            },
            {
                id: 'thunder-love',
                name: 'Thunder and Love',
                category: 'slot',
                type: 'Mythology Slot',
                image: 'img/games-pic/casino/thunder-and-love-mythology-slot-game.webp',
                alt: 'Witness the epic power of gods in the Thunder and Love slot. A mighty thunder god and a beautiful goddess unite their strengths for a cosmic adventure full of rewards.',
                priority: 5,
                time: '~3-5 min',
                popular: false,
                theme: 'fantasy',
                isNew: false
            },
            {
                id: 'super-elements',
                name: 'Super Elements',
                category: 'slot',
                type: 'Fantasy Slot',
                image: 'img/games-pic/slots/super-elements-fantasy-slot-game.webp',
                alt: 'Harness the power of the elements in the Super Elements slot. A mystical character with fiery hair manipulates elemental cubes for a chance to win up to 2000x.',
                priority: 6,
                time: '~3-5 min',
                popular: false,
                theme: 'fantasy',
                isNew: true
            },
            {
                id: 'fortune-gems',
                name: 'Fortune Gems',
                category: 'slot',
                type: 'Gem Slot',
                image: 'img/games-pic/slots/fortune-gems-slot-game-jl.webp',
                alt: 'Uncover ancient treasures in the Fortune Gems slot. A magnificent golden mask, resembling a mythical creature, serves as the key to unlocking sparkling gem rewards.',
                priority: 7,
                time: '~3-5 min',
                popular: false,
                theme: 'fantasy',
                isNew: true
            },
            {
                id: 'bonnys-treasures',
                name: 'Bonny\'s Treasures',
                category: 'slot',
                type: 'Pirate Slot',
                image: 'img/games-pic/casino/bonnys-treasures-pirate-slot-game.webp',
                alt: 'Set sail on a high-seas adventure with Bonny\'s Treasures. Join a fearless female pirate captain as she guides you toward a bounty of hidden riches and big wins.',
                priority: 8,
                time: '~3-5 min',
                popular: false,
                theme: 'classic',
                isNew: false
            },
            {
                id: 'boxing-king',
                name: 'Boxing King',
                category: 'slot',
                type: 'Fighting Slot',
                image: 'img/games-pic/casino/boxing-king-slot-game-jl.webp',
                alt: 'Step into the ring and fight for the title in the Boxing King slot. A powerful fighter is ready for the knockout round, offering a high-energy gaming experience.',
                priority: 9,
                time: '~3-5 min',
                popular: false,
                theme: 'classic',
                isNew: false
            },
            {
                id: 'cash-blitz',
                name: 'Cash Blitz',
                category: 'slot',
                type: 'Buy Feature Slot',
                image: 'img/games-pic/casino/cash-blitz-slot-buy-feature.webp',
                alt: 'Feel the electric energy of Cash Blitz! A powerful magnet attracts huge wins in this thrilling slot game that features an exciting Buy Feature option for instant action.',
                priority: 10,
                time: '~3-5 min',
                popular: false,
                theme: 'classic',
                isNew: false
            },
            // Additional games for slots page
            {
                id: '3-tombs',
                name: '3 Tombs',
                category: 'slot',
                type: 'Egyptian Slot',
                image: 'img/games-pic/slots/3-tombs-egyptian-pyramid-slot.webp',
                alt: 'Explore the mysterious 3 Tombs slot game. Three glowing pyramids made of precious gems rise from the desert, promising untold riches and ancient secrets.',
                priority: 11,
                time: '~3-5 min',
                popular: false,
                theme: 'egyptian',
                isNew: false
            },
            {
                id: 'aztec-triple',
                name: 'Aztec Triple Riches',
                category: 'slot',
                type: 'Power Combo Slot',
                image: 'img/games-pic/slots/aztec-triple-riches-power-combo-slot.webp',
                alt: 'Journey to an ancient civilization with Aztec Triple Riches. A magnificent golden idol stands guard over a temple, offering a Power Combo feature for massive wins.',
                priority: 12,
                time: '~3-5 min',
                popular: false,
                theme: 'egyptian',
                isNew: false
            },
            {
                id: 'coin-up',
                name: 'Coin Up: Hot Fire',
                category: 'slot',
                type: '3x3 Slot',
                image: 'img/games-pic/slots/coin-up-hot-fire-3x3-slot.webp',
                alt: 'Turn up the heat with Coin Up: Hot Fire! This classic 3x3 slot features a flaming gold coin symbol that can multiply your winnings for fiery hot payouts.',
                priority: 13,
                time: '~2-3 min',
                popular: false,
                theme: 'classic',
                isNew: false
            },
            {
                id: 'crazy-party',
                name: 'Crazy Party',
                category: 'slot',
                type: 'Party Slot',
                image: 'img/games-pic/slots/crazy-party-penguin-slot-game.webp',
                alt: 'Get ready to dance in the Crazy Party slot! A cool penguin wearing sunglasses and a hat plays the trumpet, leading a wild celebration with music and big wins.',
                priority: 14,
                time: '~3-5 min',
                popular: false,
                theme: 'classic',
                isNew: false
            },
            {
                id: 'egypt-hilo',
                name: 'Egypt Hilo',
                category: 'slot',
                type: 'Card Game',
                image: 'img/games-pic/slots/egypt-hilo-cat-themed-game.webp',
                alt: 'Discover a cute twist on an ancient theme in Egypt Hilo. An adorable white cat dressed as a pharaoh guides you through this charming high-low card game.',
                priority: 15,
                time: '~2-3 min',
                popular: false,
                theme: 'egyptian',
                isNew: false
            },
            {
                id: '3-fortune-souls',
                name: '3 Fortune Souls',
                category: 'slot',
                type: 'Asian Slot',
                image: 'img/games-pic/slots/3-fortune-souls-asian-themed-slot.webp',
                alt: 'Let good fortune find you in the 3 Fortune Souls slot. A golden lucky cat, a frog, and a pig bring prosperity and luck as you spin for big wins among gold coins.',
                priority: 16,
                time: '~3-5 min',
                popular: false,
                theme: 'classic',
                isNew: false
            },
            {
                id: 'legend-monkey',
                name: 'Legend of Monkey',
                category: 'slot',
                type: 'Adventure Slot',
                image: 'img/games-pic/slots/legend-of-monkey-slot-game.webp',
                alt: 'Join an epic journey in the Legend of Monkey slot. The mischievous and powerful Monkey King character is ready to lead you to legendary treasures and mythical wins.',
                priority: 17,
                time: '~3-5 min',
                popular: false,
                theme: 'fantasy',
                isNew: false
            },
            {
                id: 'pinata-wins',
                name: 'Piñata Wins',
                category: 'slot',
                type: 'Fiesta Slot',
                image: 'img/games-pic/slots/pinata-wins-fiesta-themed-slot.webp',
                alt: 'Join the fiesta and smash your way to prizes in the Piñata Wins slot! An excited girl swings a bat at a piñata, ready to release a shower of candy and cash rewards.',
                priority: 18,
                time: '~3-5 min',
                popular: false,
                theme: 'classic',
                isNew: false
            },
            {
                id: 'wild-bounty',
                name: 'Wild Bounty Showdown',
                category: 'slot',
                type: 'Western Slot',
                image: 'img/games-pic/slots/wild-bounty-showdown-western-slot.webp',
                alt: 'Draw your pistol for a Wild Bounty Showdown. A confident female sheriff in a cowboy hat is ready for a duel in this action-packed Western-themed slot game.',
                priority: 19,
                time: '~3-5 min',
                popular: false,
                theme: 'classic',
                isNew: false
            },
            // Games for games page
            {
                id: 'flyx',
                name: 'FlyX',
                category: 'crash',
                type: 'Superhero Crash Game',
                image: 'img/games-pic/games/flyx-superhero-crash-game.webp',
                alt: 'Soar to new heights with the FlyX crash game. A stylized superhero stick figure with a cape flies upwards, leaving a glowing trail of increasing multipliers.',
                priority: 2,
                time: '~2-3 min',
                popular: true,
                theme: 'crash',
                isNew: true
            },
            {
                id: 'fortune-zombie',
                name: 'Fortune Zombie',
                category: 'arcade',
                type: 'Shoot & Win Game',
                image: 'img/games-pic/games/fortune-zombie-shoot-and-win-game.webp',
                alt: 'Take on the undead and win big in Fortune Zombie! A crazy zombie character sits in a massive pile of gold coins in this exciting Shoot and Win style arcade game.',
                priority: 3,
                time: '~3-5 min',
                popular: false,
                theme: 'arcade',
                isNew: false
            },
            {
                id: 'triple-money',
                name: 'Triple Money Jackpot',
                category: 'wheel',
                type: 'Wheel of Fortune',
                image: 'img/games-pic/games/triple-money-jackpot-wheel-game.webp',
                alt: 'Spin the colorful prize wheel for a chance to win huge prizes in the Triple Money Jackpot game. Land on Grand, Major, or Mini for one of the top jackpot payouts.',
                priority: 4,
                time: '~1-2 min',
                popular: false,
                theme: 'wheel',
                isNew: false
            },
            {
                id: 'road-hunting',
                name: 'Road Hunting',
                category: 'arcade',
                type: 'Action Shooter',
                image: 'img/games-pic/games/road-hunting-action-shooter-game.webp',
                alt: 'Gear up for intense action in Road Hunting. A heavily armed robotic dinosaur vehicle fires its weapons in a high-speed chase across a desert landscape.',
                priority: 5,
                time: '~5-10 min',
                popular: false,
                theme: 'arcade',
                isNew: false
            },
            {
                id: 'sabong',
                name: 'Sabong',
                category: 'special',
                type: 'Rooster Fighting',
                image: 'img/games-pic/games/sabong-rooster-fighting-game-card.webp',
                alt: 'Witness the ultimate fight in the Sabong game. A powerful rooster wearing red boxing gloves stands ready for battle against a cosmic, electrifying background.',
                priority: 6,
                time: '~2-3 min',
                popular: false,
                theme: 'special',
                isNew: false
            }
        ];
    }

    setupEventListeners() {
        // Filter buttons
        document.addEventListener('click', (e) => {
            // На главной странице фильтры - это ссылки, не блокируем их
            if (e.target.classList.contains('filter-btn') && this.pageType !== 'main') {
                e.preventDefault();
                this.setFilter(e.target.dataset.filter);
            }
            
            if (e.target.classList.contains('sort-btn')) {
                e.preventDefault();
                this.setSort(e.target.dataset.sort);
            }
            
            if (e.target.classList.contains('theme-filter')) {
                e.preventDefault();
                this.setTheme(e.target.dataset.theme);
            }
            
            if (e.target.classList.contains('show-more-btn')) {
                e.preventDefault();
                this.showMoreGames();
            }
            
            if (e.target.classList.contains('play-btn') || e.target.classList.contains('game-card')) {
                e.preventDefault();
                this.playGame(e.target.closest('.game-card').dataset.gameId);
            }
        });
    }

    setFilter(filter) {
        this.currentFilter = filter;
        this.renderGames();
    }

    setSort(sort) {
        this.currentSort = sort;
        this.renderGames();
    }

    setTheme(theme) {
        this.currentTheme = theme;
        this.renderGames();
    }

    updateActiveButtons(selector, value) {
        document.querySelectorAll(selector).forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.filter === value || btn.dataset.sort === value || btn.dataset.theme === value) {
                btn.classList.add('active');
            }
        });
    }

    getFilteredGames() {
        let filtered = [...this.games];
        
        // Apply category filter
        if (this.currentFilter !== 'all') {
            if (this.currentFilter === 'crash') {
                filtered = filtered.filter(game => game.category === 'crash');
            } else if (this.currentFilter === 'slot') {
                filtered = filtered.filter(game => game.category === 'slot');
            } else if (this.currentFilter === 'quick') {
                // Быстрые игры - crash games и короткие слоты
                filtered = filtered.filter(game => 
                    game.category === 'crash' || 
                    game.category === 'wheel' ||
                    (game.category === 'slot' && game.time.includes('~2-3 min'))
                );
            } else if (this.currentFilter === 'strategic') {
                // Стратегические игры - arcade и некоторые слоты
                filtered = filtered.filter(game => 
                    game.category === 'arcade' || 
                    game.category === 'special' ||
                    (game.category === 'slot' && game.time.includes('~5'))
                );
            } else {
                filtered = filtered.filter(game => game.category === this.currentFilter);
            }
        }
        
        // Apply theme filter
        if (this.currentTheme !== 'all') {
            filtered = filtered.filter(game => game.theme === this.currentTheme);
        }
        
        // Apply sorting
        switch (this.currentSort) {
            case 'popularity':
                filtered.sort((a, b) => a.priority - b.priority);
                break;
            case 'new':
                // Сортировка по новизне - сначала новые игры, затем по приоритету
                filtered.sort((a, b) => {
                    // Сначала новые игры
                    if (a.isNew && !b.isNew) return -1;
                    if (!a.isNew && b.isNew) return 1;
                    // Затем по приоритету (обратный порядок для показа более новых)
                    return b.priority - a.priority;
                });
                break;
            case 'high-winnings':
                // Сортировка по высоким выигрышам - по алфавиту, но популярные игры в начале
                filtered.sort((a, b) => {
                    // Сначала популярные игры
                    if (a.popular && !b.popular) return -1;
                    if (!a.popular && b.popular) return 1;
                    // Затем игры с высоким RTP (crash games и слоты с высокими выплатами)
                    if (a.category === 'crash' && b.category !== 'crash') return -1;
                    if (a.category !== 'crash' && b.category === 'crash') return 1;
                    // Остальные по алфавиту
                    return a.name.localeCompare(b.name);
                });
                break;
            case 'a-z':
                filtered.sort((a, b) => a.name.localeCompare(b.name));
                break;
        }
        
        return filtered;
    }

    renderGames() {
        const gamesContainer = document.querySelector('.games-section .games-grid');
        if (!gamesContainer) return;
        
        const filteredGames = this.getFilteredGames();
        let gamesToShow;
        
        if (this.pageType === 'main') {
            // Show only first 8 games on main page
            gamesToShow = filteredGames.slice(0, 8);
        } else if (this.pageType === 'slots') {
            // Show slots with priority order
            const slotGames = filteredGames.filter(game => game.category === 'slot');
            gamesToShow = slotGames.slice(0, this.visibleGames);
        } else {
            // Show all games on games page
            gamesToShow = filteredGames.slice(0, this.visibleGames);
        }
        
        gamesContainer.innerHTML = gamesToShow.map(game => this.createGameCard(game)).join('');
        
        // Update active filter button based on current filter
        this.updateActiveFilterButtons();
        
        // Update show more button visibility
        const showMoreBtn = document.querySelector('.show-more-btn');
        if (showMoreBtn) {
            const totalFiltered = this.pageType === 'slots' ? 
                filteredGames.filter(game => game.category === 'slot').length : 
                filteredGames.length;
            showMoreBtn.style.display = totalFiltered > this.visibleGames ? 'block' : 'none';
        }
    }

    updateActiveFilterButtons() {
        // Для страницы games обновляем активные кнопки фильтров
        if (this.pageType === 'games') {
            // Обновляем основные фильтры категорий
            document.querySelectorAll('.games-filters .filter-btn[data-filter]').forEach(btn => {
                btn.classList.remove('active');
                if (btn.dataset.filter === this.currentFilter) {
                    btn.classList.add('active');
                }
            });
            
            // Обновляем быстрые фильтры
            document.querySelectorAll('.quick-filters .filter-btn[data-filter]').forEach(btn => {
                btn.classList.remove('active');
                if (btn.dataset.filter === this.currentFilter) {
                    btn.classList.add('active');
                }
            });
        }
        
        // Update sort buttons on slots page
        if (this.pageType === 'slots') {
            document.querySelectorAll('.sort-btn').forEach(btn => {
                btn.classList.remove('active');
                if (btn.dataset.sort === this.currentSort) {
                    btn.classList.add('active');
                }
            });
            
            // Update theme buttons on slots page  
            document.querySelectorAll('.theme-filter').forEach(btn => {
                btn.classList.remove('active');
                if (btn.dataset.theme === this.currentTheme) {
                    btn.classList.add('active');
                }
            });
        }
    }

    createGameCard(game) {
        const popularBadge = game.popular ? '<div class="popular-badge">Popular</div>' : '';
        
        // Определяем иконку типа игры
        let gameTypeIcon = '';
        if (game.category === 'slot') {
            gameTypeIcon = '<i class="fas fa-dice"></i>';
        } else if (game.category === 'crash') {
            gameTypeIcon = '<i class="fas fa-plane"></i>';
        } else if (game.category === 'arcade') {
            gameTypeIcon = '<i class="fas fa-gamepad"></i>';
        } else if (game.category === 'wheel') {
            gameTypeIcon = '<i class="fas fa-circle"></i>';
        } else if (game.category === 'special') {
            gameTypeIcon = '<i class="fas fa-star"></i>';
        }
        
        const gameTypeBadge = `<div class="game-type-badge">${gameTypeIcon}</div>`;
        
        let playButtonText = 'Play Now';
        if (this.pageType === 'slots') {
            playButtonText = 'Play slot';
        } else if (this.pageType === 'games') {
            playButtonText = 'Play Now';
        }
        
        return `
            <div class="game-card" data-game-id="${game.id}">
                ${popularBadge}
                ${gameTypeBadge}
                <div class="game-image">
                    <img src="${game.image}" alt="${game.alt}" loading="lazy">
                    <div class="game-overlay">
                        <button class="btn btn-primary">${playButtonText}</button>
                        ${this.pageType === 'slots' ? '<button class="btn btn-secondary">Demo game</button>' : ''}
                    </div>
                </div>
                <div class="game-info">
                    <h3 class="game-title">${game.name}</h3>
                    <div class="game-category">${game.type}</div>
                    <div class="game-time">
                        <i class="fas fa-clock"></i>
                        ${game.time}
                    </div>
                </div>
            </div>
        `;
    }

    showMoreGames() {
        this.visibleGames += 12;
        this.renderGames();
    }

    playGame(gameId) {
        // Redirect to referral link
        window.open('https://imagoliz.com/HLBxtb2h', '_blank', 'rel=sponsored nofollow');
    }
}

// Initialize games when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new GamesManager();
});
