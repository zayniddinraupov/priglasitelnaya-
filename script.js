 (function () {
                                // ====== ПРЕЛОУДЕР ======
                                const PRELOADER_EL = '.uc-ndt-preloader';
                                const START_BTN = '.ndt-start-btn';

                                // Анимируемый контейнер
                                const CONTAINER_SEL = '.container';

                                // ====== ID ВТОРОГО БЛОКА ======
                                const SECOND_REC = '#rec1944160141'; // ← ЗАМЕНИ

                                // ====== НАСТРОЙКИ ======
                                const FALLBACK_ANIM_MS = 2500;
                                const SCROLL_DURATION_MS = 1200; // быстро, но плавно
                                const FIRST_PAGE_DELAY_MS = 3000;

                                // Насколько “ниже второго блока” считаем, что пользователь уже ушёл дальше
                                // (чтобы не дергать туда-сюда из-за мелких колебаний)
                                const PASSED_SECOND_PX = 80;

                                let playedThisLoad = false;
                                let isScrolling = false;

                                // Таймеры/флаги для отмены
                                let scrollTimerId = null;
                                let aborted = false;

                                function abort(reason) {
                                    if (aborted) return;
                                    aborted = true;

                                    // считаем сценарий проигранным
                                    playedThisLoad = true;

                                    // отменяем будущий автоскролл
                                    if (scrollTimerId) {
                                        clearTimeout(scrollTimerId);
                                        scrollTimerId = null;
                                    }

                                    // если вдруг уже шёл наш скролл — просто помечаем, чтобы дальше не продолжать
                                    // (requestAnimationFrame сам остановится по флагу isScrolling/aborted)
                                    // reason можно логировать при отладке:
                                    // console.log('[ndt] aborted:', reason);
                                }

                                // ====== HIGH-HZ SCROLL ENGINE ======
                                function smoothEase(t) {
                                    return 1 - Math.pow(1 - t, 3);
                                }

                                function highHzScrollTo(targetY, duration) {
                                    if (isScrolling || aborted) return;
                                    isScrolling = true;

                                    const startY = window.scrollY;
                                    const delta = targetY - startY;
                                    const start = performance.now();

                                    function frame(now) {
                                        if (aborted) { isScrolling = false; return; }

                                        const raw = (now - start) / duration;
                                        const t = Math.min(raw, 1);
                                        const eased = smoothEase(t);

                                        window.scrollTo({
                                            top: startY + delta * eased,
                                            behavior: 'auto'
                                        });

                                        if (t < 1) {
                                            requestAnimationFrame(frame);
                                        } else {
                                            isScrolling = false;
                                        }
                                    }

                                    requestAnimationFrame(frame);
                                }

                                function getRecTop(recSel) {
                                    const el = document.querySelector(recSel);
                                    if (!el) return null;
                                    return el.getBoundingClientRect().top + window.scrollY;
                                }

                                function hasPassedSecond() {
                                    const secondTop = getRecTop(SECOND_REC);
                                    if (secondTop == null) return false;
                                    return window.scrollY >= (secondTop + PASSED_SECOND_PX);
                                }

                                function scrollToRec(recSel) {
                                    if (aborted) return;

                                    const top = getRecTop(recSel);
                                    if (top == null) return;

                                    // финальная защита: если пользователь уже ниже 2-го блока — не тянем назад
                                    if (hasPassedSecond()) return;

                                    highHzScrollTo(top, SCROLL_DURATION_MS);
                                }

                                // ====== ЖДЁМ ПРЕЛОУДЕР ======
                                function waitForPreloaderDone() {
                                    return new Promise(resolve => {
                                        if (aborted) return resolve();

                                        const pr = document.querySelector(PRELOADER_EL);
                                        if (!pr || pr.classList.contains('activated')) return resolve();

                                        const mo = new MutationObserver(() => {
                                            if (aborted) { mo.disconnect(); return resolve(); }
                                            if (pr.classList.contains('activated')) {
                                                mo.disconnect();
                                                resolve();
                                            }
                                        });
                                        mo.observe(pr, { attributes: true, attributeFilter: ['class'] });

                                        setTimeout(() => {
                                            mo.disconnect();
                                            resolve();
                                        }, 8000);
                                    });
                                }

                                // ====== ЖДЁМ КОНЕЦ АНИМАЦИИ ======
                                function cssTimeToMs(v) {
                                    return Math.max(...String(v || '0s').split(',').map(s => {
                                        s = s.trim();
                                        if (s.endsWith('ms')) return parseFloat(s);
                                        if (s.endsWith('s')) return parseFloat(s) * 1000;
                                        return 0;
                                    }));
                                }

                                function getAnimTotalMs(el) {
                                    if (!el) return 0;
                                    const st = getComputedStyle(el);
                                    return Math.max(
                                        cssTimeToMs(st.animationDuration) + cssTimeToMs(st.animationDelay),
                                        cssTimeToMs(st.transitionDuration) + cssTimeToMs(st.transitionDelay)
                                    );
                                }

                                function waitForContainerAnim() {
                                    return new Promise(resolve => {
                                        if (aborted) return resolve();

                                        const c = document.querySelector(CONTAINER_SEL);
                                        if (!c) return resolve();

                                        const waitMs = Math.max(getAnimTotalMs(c), FALLBACK_ANIM_MS);
                                        setTimeout(resolve, waitMs + 100);
                                    });
                                }

                                // ====== ЕСЛИ ПОЛЬЗОВАТЕЛЬ САМ СКРОЛЛИТ/НАВИГИРУЕТ — ОТМЕНЯЕМ АВТОСКРОЛЛ ======
                                // (Чтобы не возвращало с 3-го на 2-й)
                                const userCancelEvents = ['wheel', 'touchmove', 'keydown'];
                                userCancelEvents.forEach(evt => {
                                    window.addEventListener(evt, () => {
                                        // если уже запущен сценарий и пользователь начал действовать — отменяем
                                        if (!playedThisLoad && !aborted) abort('user interaction: ' + evt);
                                    }, { passive: true });
                                });

                                // Дополнительно: если пользователь просто проскроллил (например, через скроллбар/якорь),
                                // и при этом уже прошёл второй блок — отменяем.
                                window.addEventListener('scroll', () => {
                                    if (!playedThisLoad && !aborted && hasPassedSecond()) {
                                        abort('passed second on scroll');
                                    }
                                }, { passive: true });

                                // ====== СТАРТ ======
                                document.addEventListener('click', async function (e) {
                                    if (!e.target.closest(START_BTN)) return;
                                    if (playedThisLoad) return;

                                    // запускаем сценарий
                                    playedThisLoad = true;
                                    aborted = false;

                                    await waitForPreloaderDone();
                                    if (aborted) return;

                                    await waitForContainerAnim();
                                    if (aborted) return;

                                    // Перед постановкой таймера — если уже ушёл дальше, не делаем ничего
                                    if (hasPassedSecond()) return;

                                    scrollTimerId = setTimeout(() => {
                                        scrollTimerId = null;
                                        if (aborted) return;
                                        // финальная проверка прямо перед автоскроллом
                                        if (hasPassedSecond()) return;
                                        scrollToRec(SECOND_REC);
                                    }, FIRST_PAGE_DELAY_MS);

                                }, { passive: true });

                                // ====== КЛИК НА ЗАСТАВКУ ======
                                document.addEventListener('DOMContentLoaded', function () {
                                    const cover = document.getElementById('coverEntrance');
                                    const mainContent = document.getElementById('mainContent');
                                    if (cover && mainContent) {
                                        cover.addEventListener('click', function () {
                                            if (cover.classList.contains('cover-opened')) return;

                                            // эффект затемнения + раскрытия
                                            cover.classList.add('cover-opened');
                                            mainContent.classList.add('visible');
                                            mainContent.setAttribute('aria-hidden', 'false');

                                            window.scrollTo({ top: 0, behavior: 'smooth' });

                                            setTimeout(() => {
                                                cover.style.display = 'none';
                                            }, 900);
                                        });
                                    }
                                });

                            })();