const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "src", "App.jsx");
const backup = file + ".before-mm-fix";

if (!fs.existsSync(file)) {
  console.error("❌ Не найден src/App.jsx");
  process.exit(1);
}

fs.copyFileSync(file, backup);

let code = fs.readFileSync(file, "utf8");
let changed = 0;

function replaceOnce(label, oldText, newText) {
  if (!code.includes(oldText)) {
    console.log(`⚠️ Не найдено: ${label}`);
    return false;
  }

  code = code.replace(oldText, newText);
  console.log(`✅ ${label}`);
  changed++;
  return true;
}

/* =========================================================
   1. Убираем 10-й повторяющийся цвет
   ========================================================= */

replaceOnce(
  "9 базовых цветов",
`const BASIC_COLORS = [
  "#111111",
  "#ffffff",
  "#ff3b30",
  "#ff9500",
  "#ffcc00",
  "#34c759",
  "#00c7be",
  "#007aff",
  "#5856d6",
  "#ff2d55",
];`,
`const BASIC_COLORS = [
  "#111111",
  "#ffffff",
  "#ff3b30",
  "#ff9500",
  "#ffcc00",
  "#34c759",
  "#00c7be",
  "#007aff",
  "#5856d6",
];`
);

/* =========================================================
   2. Ключи постоянного хранения
   ========================================================= */

if (!code.includes('const CUSTOM_COLORS_KEY = "mm-custom-colors";')) {
  const marker = 'const CURRENT_SCREEN_KEY = "mm-current-screen";';

  if (code.includes(marker)) {
    code = code.replace(
      marker,
`${marker}
const CUSTOM_COLORS_KEY = "mm-custom-colors";
const SCROLL_POSITIONS_KEY = "mm-scroll-positions";`
    );

    console.log("✅ Добавлены ключи локального хранения");
    changed++;
  } else {
    console.log("⚠️ Не найден CURRENT_SCREEN_KEY");
  }
}

/* =========================================================
   3. Локальное сохранение карт
   ========================================================= */

if (!code.includes("function saveMapsLocally")) {
  const marker = "function normalizeMap";

  const index = code.indexOf(marker);

  if (index !== -1) {
    const fn = `
function saveMapsLocally(nextMaps) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        nextMaps.map(normalizeMap)
      )
    );
  } catch (error) {
    console.error(
      "Не удалось сохранить карты локально:",
      error
    );
  }
}

`;

    code = code.slice(0, index) + fn + code.slice(index);

    console.log("✅ Добавлено локальное сохранение карт");
    changed++;
  }
}

/* =========================================================
   4. Сохраняем maps при любом изменении
   ========================================================= */

if (!code.includes("saveMapsLocally(maps);")) {
  const marker = "function saveMapsLocally(nextMaps)";

  const markerIndex = code.indexOf(marker);

  if (markerIndex !== -1) {
    const endIndex = code.indexOf("\n}", markerIndex);

    if (endIndex !== -1) {
      const effect = `

useEffect(() => {
  if (!Array.isArray(maps)) {
    return;
  }

  saveMapsLocally(maps);
}, [maps]);
`;

      const insertAfter = code.indexOf("\n}", endIndex + 2);

      if (insertAfter !== -1) {
        code =
          code.slice(0, insertAfter + 2) +
          effect +
          code.slice(insertAfter + 2);

        console.log("✅ Добавлено автосохранение карт");
        changed++;
      }
    }
  }
}

/* =========================================================
   5. Разрешаем создавать карту без аккаунта
   ========================================================= */

replaceOnce(
  "гостевое создание карты",
`async function createMap() {
  if (!user) {
    return;
  }

  const name =`,
`async function createMap() {
  const name =`
);

/* =========================================================
   6. Убираем принудительный экран авторизации
   ========================================================= */

replaceOnce(
  "гостевой доступ вместо Auth-блокировки",
`if (!user) {
    return (
      <Auth onAuth={setUser} />
    );
  }`,
``
);

/* =========================================================
   7. Сохраняем текущий экран
   ========================================================= */

if (!code.includes("localStorage.setItem(\n    CURRENT_SCREEN_KEY")) {
  const marker = "useEffect(() => {";

  const index = code.indexOf(marker);

  if (index !== -1) {
    const effect = `
useEffect(() => {
  localStorage.setItem(
    CURRENT_SCREEN_KEY,
    screen
  );
}, [screen]);

`;

    code = code.slice(0, index) + effect + code.slice(index);

    console.log("✅ Добавлено сохранение текущего раздела");
    changed++;
  }
}

/* =========================================================
   8. Восстановление позиции страницы
   ========================================================= */

if (!code.includes("SCROLL_POSITIONS_KEY-${screen}")) {
  const marker = "useEffect(() => {";

  const index = code.indexOf(marker);

  if (index !== -1) {
    const effect = `
useEffect(() => {
  const key =
    \`\${SCROLL_POSITIONS_KEY}-\${screen}\`;

  const handleScroll = () => {
    localStorage.setItem(
      key,
      String(window.scrollY)
    );
  };

  window.addEventListener(
    "scroll",
    handleScroll,
    { passive: true }
  );

  return () => {
    window.removeEventListener(
      "scroll",
      handleScroll
    );
  };
}, [screen]);

useEffect(() => {
  const key =
    \`\${SCROLL_POSITIONS_KEY}-\${screen}\`;

  const saved =
    Number(
      localStorage.getItem(key)
    ) || 0;

  requestAnimationFrame(() => {
    window.scrollTo(0, saved);
  });
}, [screen]);

`;

    code = code.slice(0, index) + effect + code.slice(index);

    console.log("✅ Добавлено восстановление прокрутки");
    changed++;
  }
}

/* =========================================================
   9. Ctrl+Z / Ctrl+Y
   ========================================================= */

const oldUndoStart =
`const handleKeyDown = (event) => {
    if (
      event.ctrlKey &&
      event.key.toLowerCase() === "z"
    ) {`;

const undoIndex = code.indexOf(oldUndoStart);

if (undoIndex !== -1) {
  const effectEnd = code.indexOf(
    "window.removeEventListener",
    undoIndex
  );

  if (effectEnd !== -1) {
    const handlerEnd = code.lastIndexOf(
      "};",
      effectEnd
    );

    if (handlerEnd !== -1) {
      const oldHandler = code.slice(
        undoIndex,
        handlerEnd + 2
      );

      const newHandler = `const handleKeyDown = (event) => {
    const target = event.target;

    const isTextField =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target?.isContentEditable;

    if (isTextField) {
      return;
    }

    const modifier =
      event.ctrlKey || event.metaKey;

    if (!modifier) {
      return;
    }

    const key =
      event.key.toLowerCase();

    if (key === "z") {
      event.preventDefault();

      if (event.shiftKey) {
        redo();
      } else {
        undo();
      }

      return;
    }

    if (key === "y") {
      event.preventDefault();
      redo();
    }
  };`;

      code = code.replace(
        oldHandler,
        newHandler
      );

      console.log("✅ Исправлены Ctrl+Z / Ctrl+Y");
      changed++;
    }
  }
}

/* =========================================================
   10. Вторая демо-карта: 30 клеток / 15 заполнено
   ========================================================= */

replaceOnce(
  "вторая демо-карта: 30 клеток",
`length: 104,`,
`length: 30,`
);

replaceOnce(
  "вторая демо-карта: 15 заполненных",
`index < 52 &&`,
`index < 15 &&`
);

replaceOnce(
  "вторая демо-карта: 15/30",
`52 / 104`,
`15 / 30`
);

/* =========================================================
   11. Убираем надпись saved у второй демо-карты
   ========================================================= */

replaceOnce(
  "убираем saved",
`<p>
              {t("saved")}
            </p>`,
``
);

/* =========================================================
   12. Добавляем zoom карты
   ========================================================= */

if (!code.includes("const [mapZoom, setMapZoom]")) {
  const marker =
    "const [completed, setCompleted]";

  const index = code.indexOf(marker);

  if (index !== -1) {
    code = code.slice(0, index) +
`
const [mapZoom, setMapZoom] = useState(1);

function handleMapWheel(event) {
  if (!event.ctrlKey) {
    return;
  }

  event.preventDefault();

  const delta =
    event.deltaY > 0 ? -0.1 : 0.1;

  setMapZoom((value) =>
    Math.min(
      3,
      Math.max(
        0.5,
        Number(
          (value + delta).toFixed(2)
        )
      )
    )
  );
}

` +
      code.slice(index);

    console.log("✅ Добавлен zoom карты");
    changed++;
  }
}

/* =========================================================
   13. Сохраняем пользовательские цвета
   ========================================================= */

if (!code.includes("CUSTOM_COLORS_KEY")) {
  console.log("⚠️ Не удалось автоматически добавить custom colors");
} else if (!code.includes("localStorage.setItem(\n      CUSTOM_COLORS_KEY")) {
  const marker = "useEffect(() => {";

  const index = code.indexOf(marker);

  if (index !== -1) {
    const effect = `
useEffect(() => {
  try {
    localStorage.setItem(
      CUSTOM_COLORS_KEY,
      JSON.stringify(customColors)
    );
  } catch (error) {
    console.error(
      "Не удалось сохранить пользовательские цвета:",
      error
    );
  }
}, [customColors]);

`;

    code = code.slice(0, index) + effect + code.slice(index);

    console.log("✅ Добавлено сохранение пользовательских цветов");
    changed++;
  }
}

/* =========================================================
   14. Сохраняем файл
   ========================================================= */

fs.writeFileSync(file, code, "utf8");

console.log("");
console.log("========================================");
console.log(`Готово. Изменений: ${changed}`);
console.log("========================================");
console.log("");
console.log("Резервная копия:");
console.log("src/App.jsx.before-mm-fix");
console.log("");
console.log("ВАЖНО:");
console.log("Если Vite покажет ошибку — НЕ исправляй вручную.");
console.log("Просто пришли мне ошибку.");
