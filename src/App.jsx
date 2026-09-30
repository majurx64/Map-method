import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./App.css";
import { supabase } from "./lib/supabase";
import { flushAnalytics, trackAnalytics } from "./lib/analytics";
import Auth from "./Auth";
import { cardDragPosition, cardDropIndex } from "./lib/cardDrag";
import { isStandaloneApp, hasInstalledApp, openApp } from "./lib/appLaunch";
import { acknowledgeMapSave, cacheAccountMaps, discardPendingMap, mergePendingMaps, pendingMapSaves, queueMapSave, readAccountCache } from "./lib/offlineMaps";
import { MAX_CELLS, getGridDimensions, remapCells, remapColors, getMapStats, imagePlacement, zoomScrollDelta, gridResizeShift, normalizeImageOffset, selectionFromCells, selectionContains, moveSelection } from "./lib/grid";
import { PLAN_MODES, adaptiveDailyTarget, addChangeSnapshot, addDailySnapshot, calculateStreaks, createBackup, createMapSnapshot, decodeSharedSnapshot, encodeSharedSnapshot, normalizeVersions, parseBackup, publicSnapshot, restoreSnapshot } from "./lib/productFeatures";

const STORAGE_KEY = "mm-maps";
const ACTIVE_MAP_KEY = "mm-active-map";
const LANGUAGE_KEY = "mm-language";
const CURRENT_SCREEN_KEY = "mm-current-screen";
const CUSTOM_COLORS_KEY = "mm-custom-colors";
const CUSTOM_CATEGORIES_KEY = "mm-custom-categories";
const CATEGORY_ORDER_KEY = "mm-category-order";
const SCROLL_POSITIONS_KEY = "mm-scroll-positions";
const ACHIEVEMENT_SESSION_KEY = "mm-celebrated-achievements";
const PRIVATE_LIBRARY_KEY = "mm-private-library";
const METRO_2035_RECOVERY_KEY = "mm-recovered-metro-2035";
const LEGACY_MAP_MIGRATION_KEY = "mm-legacy-map-migration";
const LOCAL_MAP_OWNER_KEY = "mm-local-map-owner";
const FEEDBACK_BUCKET = "feedback-attachments";
const FEEDBACK_MAX_BYTES = 50 * 1024 * 1024;
const UTILITY_COLOR = "#eeeeee";
const PUBLIC_LIBRARY_OWNER_EMAIL = "majurx64@yandex.ru";
const PUBLIC_LIBRARY_TABLE = "library_items";
const SAVED_ACCOUNTS_KEY = "mm-saved-accounts";
const FEEDBACK_TABLE = "feedback_messages";
const MAPS_COLUMNS_KEY = "mm-maps-columns";
const LIBRARY_FAVORITES_KEY = "mm-library-favorites";
const LIBRARY_USAGE_KEY = "mm-library-usage";
const ONBOARDING_KEY = "mm-onboarding";
const SHARED_MAPS_TABLE = "shared_maps";

function getYandexReplyUrl(message) {
  const email = message.reply_email || "";
  const subject = `Ответ на обращение в Map Method: ${message.kind}`;
  const body = `Здравствуйте!\n\nСпасибо за обращение в Map Method.\n\n[Напишите ответ здесь]\n\nЕсли у вас появятся дополнительные вопросы, можете ответить на это письмо.\n\nС уважением,\nMap Method`;
  const mailto = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return `https://mail.yandex.ru/compose?mailto=${encodeURIComponent(mailto)}`;
}

const BASIC_COLORS = [
  "#111111",
  "#ffffff",
  "#ff3b30",
  "#ff9500",
  "#ffcc00",
  "#34c759",
  "#00c7be",
  "#007aff",
  "#5856d6",
  "#FF47CA",
  UTILITY_COLOR,
];

const MAP_CATEGORIES = ["Личное", "Здоровье", "Учёба", "Работа", "Творчество"];
const LANGUAGE_OPTIONS = [
  ["ru", "Русский"], ["en", "English"], ["es", "Español"], ["ja", "日本語"], ["de", "Deutsch"],
  ["fr", "Français"], ["it", "Italiano"], ["pt", "Português"], ["zh", "中文"], ["ko", "한국어"],
];

const DEMO_PYRAMID_ROWS = [1, 3, 5, 7, 9, 11, 13, 15, 17];
const DEMO_PYRAMID_TOTAL = DEMO_PYRAMID_ROWS.reduce((sum, count) => sum + count, 0);
const DEMO_PYRAMID_INITIAL = (() => {
  const filled = [];
  let offset = 0;
  const widestRow = DEMO_PYRAMID_ROWS.at(-1);
  DEMO_PYRAMID_ROWS.forEach((count) => {
    const startColumn = (widestRow - count) / 2;
    for (let column = 0; column < count; column += 1) {
      if ((startColumn + column) % 2 === 0) filled.push(offset + column);
    }
    offset += count;
  });
  return filled;
})();

function createLibraryTemplate(name, lines) {
  const rows = lines.length;
  const cols = Math.max(...lines.map((line) => line.length));
  const completed = [];
  const colors = [];
  lines.forEach((line, row) => [...line.padEnd(cols)].forEach((cell, column) => {
    if (cell !== "#") return;
    const index = row * cols + column;
    completed.push(index);
    colors[index] = "#111111";
  }));
  return {
    id: `public-${name}`,
    name,
    mapType: "free",
    gridMode: "manual",
    totalCells: String(rows * cols),
    manualRows: String(rows),
    manualCols: String(cols),
    completed,
    progressCompleted: [],
    colors,
    category: "Творчество",
  };
}

const BUILTIN_PUBLIC_LIBRARY = [
  createLibraryTemplate("Сердце", [" ##   ## ", "#### ####", "#########", " ####### ", "  #####  ", "   ###   ", "    #    "]),
  createLibraryTemplate("Гора", ["        #        ", "       ###       ", "      #####      ", "     ### ###     ", "    ###   ###    ", "   ###     ###   ", "  ###       ###  ", "#################"]),
  createLibraryTemplate("Галочка", ["           ## ", "          ### ", "         ###  ", "##      ###   ", "###    ###    ", " ###  ###     ", "  ######      ", "   ####       ", "    ##        ", "              "]),
];

const METRO_2035_PATTERN = [
  "....................",
  "....###......###....",
  "...gggg##..##gggg...",
  "..#.....D##D.....#..",
  ".#g......DD......g#.",
  ".#D.gggg....gggg.D#.",
  "gRD.....g..g.....DRg",
  "gRD....gg..ggg...DRg",
  "#RD.gg.........g.DR#",
  "#RD...ggg..gggg..DR#",
  "#RD.g..........g.DR#",
  "#RD..gggg..gggg..DR#",
  ".D................D.",
  "gRD..............DRg",
  "#RRDDDDDD..DDDDDDRR#",
  ".#RRRRRRR##RRRRRDR#.",
  "..#g#####RR#####g#..",
  ".........##.........",
  "....................",
  "....................",
];

function createRecoveredMetroMap(order = 0) {
  const palette = { ".": UTILITY_COLOR, "#": "#111111", g: "#7a7a7a", R: "#c93434", D: "#8f3534" };
  const completed = Array.from({ length: 383 }, (_, index) => index);
  const colors = completed.map((index) => palette[METRO_2035_PATTERN[Math.floor(index / 20)]?.[index % 20] || "."]);
  return normalizeMap({
    id: createMapId(),
    order,
    name: "Метро 2035",
    description: "",
    category: "Чтение",
    mapType: "free",
    gridMode: "auto",
    totalCells: "383",
    completed,
    progressCompleted: completed,
    colors,
    isGameMode: true,
  });
}

const translations = {
  ru: {
    myMaps: "Мои карты",
    editor: "Редактор",
    save: "Сохранить",
    mapData: "Данные карты",
    name: "Название",
    description: "Описание",
    mapDescription: "Описание карты",
    new: "Новая",
    edit: "Изменить",
    delete: "Удалить",
    canvasSize: "Размер холста",
    auto: "Авто",
    manual: "Вручную",
    cells: "Клеток",
    rows: "Строки",
    columns: "Столбцы",
    grid: "Сетка",
    tools: "Инструменты",
    brush: "Кисть",
    image: "Изображение",
    undo: "Отменить",
    redo: "Повторить",
    uploadImage: "Загрузить изображение",
    replaceImage: "Заменить изображение",
    clearImage: "Удалить изображение",
    showImage: "Показывать изображение",
    palette: "Палитра",
    brushColor: "Цвет кисти",
    newCells: "Новые клетки",
    myColors: "Мои цвета",
    addColor: "Добавить",
    imageMap: "Карта из изображения",
    freeDrawing: "Свободный рисунок",
    newMap: "Новая карта",
    preview: "Предпросмотр",
    filled: "заполнено",
    painted: "Закрашено",
    total: "Всего",
    clearProgress: "Очистить прогресс",
    drawHint: "ЛКМ — рисовать · ПКМ — стирать",
    mapsEmpty: "У тебя пока нет карт",
    open: "Открыть",
    createMap: "Создать карту",
    renameMap: "Переименовать карту",
    newName: "Новое название",
    mapType: "Тип карты",
    cancel: "Отмена",
    deleteMap: "Удалить карту",
    account: "Личный кабинет",
    logout: "Выйти",
    accountMaps: "Карт создано",
    accountCells: "Клеток закрашено",
    accountDescription:
      "Здесь будет собираться твоя статистика, карты и будущие достижения.",
    accountProgress: "Прогресс",
    accountMember: "Профиль",
  },

  en: {
    myMaps: "My maps",
    editor: "editor",
    save: "Save",
    mapData: "Map data",
    name: "Name",
    description: "Description",
    mapDescription: "Map description",
    new: "New",
    edit: "Edit",
    delete: "Delete",
    canvasSize: "Canvas size",
    auto: "Auto",
    manual: "Manual",
    cells: "cells",
    rows: "Rows",
    columns: "Columns",
    grid: "Grid",
    tools: "Tools",
    brush: "Brush",
    image: "Image",
    undo: "Undo",
    redo: "Redo",
    uploadImage: "Upload image",
    replaceImage: "Replace image",
    clearImage: "Clear image",
    showImage: "Show image",
    palette: "Palette",
    brushColor: "Brush color",
    newCells: "New cells",
    myColors: "My colors",
    addColor: "Add",
    imageMap: "Image map",
    freeDrawing: "Free drawing",
    newMap: "New map",
    preview: "Preview",
    filled: "filled",
    painted: "Painted",
    total: "Total",
    clearProgress: "Clear progress",
    drawHint: "LMB — draw · RMB — erase",
    mapsEmpty: "You don't have any maps yet",
    open: "Open",
    createMap: "Create map",
    renameMap: "Rename map",
    newName: "New name",
    mapType: "Map type",
    cancel: "Cancel",
    deleteMap: "Delete map",
    account: "Personal account",
    logout: "Log out",
    accountMaps: "Maps created",
    accountCells: "Cells filled",
    accountDescription:
      "Your statistics, maps and future achievements will appear here.",
    accountProgress: "Progress",
    accountMember: "Profile",
  },

  es: {
    myMaps: "Mis mapas",
    editor: "editor",
    save: "Guardar",
    mapData: "Datos del mapa",
    name: "Nombre",
    description: "Descripción",
    mapDescription: "Descripción del mapa",
    new: "Nuevo",
    edit: "Editar",
    delete: "Eliminar",
    canvasSize: "Tamaño del lienzo",
    auto: "Auto",
    manual: "Manual",
    cells: "celdas",
    rows: "Filas",
    columns: "Columnas",
    grid: "Cuadrícula",
    tools: "Herramientas",
    brush: "Pincel",
    image: "Imagen",
    undo: "Deshacer",
    redo: "Rehacer",
    uploadImage: "Subir imagen",
    replaceImage: "Cambiar imagen",
    clearImage: "Eliminar imagen",
    showImage: "Mostrar imagen",
    palette: "Paleta",
    brushColor: "Color del pincel",
    newCells: "Nuevas celdas",
    myColors: "Mis colores",
    addColor: "Añadir",
    imageMap: "Mapa de imagen",
    freeDrawing: "Dibujo libre",
    newMap: "Nuevo mapa",
    preview: "Vista previa",
    filled: "completado",
    painted: "Pintadas",
    total: "Total",
    clearProgress: "Limpiar progreso",
    drawHint: "Clic izq. — dibujar · clic der. — borrar",
    mapsEmpty: "Todavía no tienes mapas",
    open: "Abrir",
    createMap: "Crear mapa",
    renameMap: "Renombrar mapa",
    newName: "Nuevo nombre",
    mapType: "Tipo de mapa",
    cancel: "Cancelar",
    deleteMap: "Eliminar mapa",
    account: "Cuenta personal",
    logout: "Cerrar sesión",
    accountMaps: "Mapas creados",
    accountCells: "Celdas rellenadas",
    accountDescription:
      "Aquí aparecerán tus estadísticas, mapas y futuros logros.",
    accountProgress: "Progreso",
    accountMember: "Perfil",
  },

  ja: {
    myMaps: "マイマップ",
    editor: "エディター",
    save: "保存",
    mapData: "マップ情報",
    name: "名前",
    description: "説明",
    mapDescription: "マップの説明",
    new: "新規",
    edit: "編集",
    delete: "削除",
    canvasSize: "キャンバスサイズ",
    auto: "自動",
    manual: "手動",
    cells: "セル",
    rows: "行",
    columns: "列",
    grid: "グリッド",
    tools: "ツール",
    brush: "ブラシ",
    image: "画像",
    undo: "元に戻す",
    redo: "やり直す",
    uploadImage: "画像をアップロード",
    replaceImage: "画像を変更",
    clearImage: "画像を削除",
    showImage: "画像を表示",
    palette: "パレット",
    brushColor: "ブラシの色",
    newCells: "新しいセル",
    myColors: "マイカラー",
    addColor: "追加",
    imageMap: "画像マップ",
    freeDrawing: "フリードロー",
    newMap: "新しいマップ",
    preview: "プレビュー",
    filled: "完了",
    painted: "塗ったセル",
    total: "合計",
    clearProgress: "進捗をクリア",
    drawHint: "左クリック — 描く · 右クリック — 消す",
    mapsEmpty: "まだマップがありません",
    open: "開く",
    createMap: "マップを作成",
    renameMap: "名前を変更",
    newName: "新しい名前",
    mapType: "マップタイプ",
    cancel: "キャンセル",
    deleteMap: "マップを削除",
    account: "マイアカウント",
    logout: "ログアウト",
    accountMaps: "作成したマップ",
    accountCells: "塗ったセル",
    accountDescription:
      "ここに統計、マップ、今後の実績が表示されます。",
    accountProgress: "進捗",
    accountMember: "プロフィール",
  },

  de: {
    myMaps: "Meine Karten",
    editor: "Editor",
    save: "Speichern",
    mapData: "Kartendaten",
    name: "Name",
    description: "Beschreibung",
    mapDescription: "Kartenbeschreibung",
    new: "Neu",
    edit: "Bearbeiten",
    delete: "Löschen",
    canvasSize: "Leinwandgröße",
    auto: "Auto",
    manual: "Manuell",
    cells: "Zellen",
    rows: "Zeilen",
    columns: "Spalten",
    grid: "Raster",
    tools: "Werkzeuge",
    brush: "Pinsel",
    image: "Bild",
    undo: "Rückgängig",
    redo: "Wiederholen",
    uploadImage: "Bild hochladen",
    replaceImage: "Bild ersetzen",
    clearImage: "Bild löschen",
    showImage: "Bild anzeigen",
    palette: "Palette",
    brushColor: "Pinselfarbe",
    newCells: "Neue Zellen",
    myColors: "Meine Farben",
    addColor: "Hinzufügen",
    imageMap: "Bildkarte",
    freeDrawing: "Freie Zeichnung",
    newMap: "Neue Karte",
    preview: "Vorschau",
    filled: "gefüllt",
    painted: "Ausgefüllt",
    total: "Gesamt",
    clearProgress: "Fortschritt löschen",
    drawHint: "Linksklick — zeichnen · Rechtsklick — löschen",
    mapsEmpty: "Noch keine Karten",
    open: "Öffnen",
    createMap: "Karte erstellen",
    renameMap: "Karte umbenennen",
    newName: "Neuer Name",
    mapType: "Kartentyp",
    cancel: "Abbrechen",
    deleteMap: "Karte löschen",
    account: "Persönliches Konto",
    logout: "Abmelden",
    accountMaps: "Erstellte Karten",
    accountCells: "Ausgefüllte Zellen",
    accountDescription:
      "Hier werden deine Statistiken, Karten und zukünftigen Erfolge angezeigt.",
    accountProgress: "Fortschritt",
    accountMember: "Profil",
  },

  fr: {
    myMaps: "Mes cartes",
    editor: "éditeur",
    save: "Enregistrer",
    mapData: "Données de la carte",
    name: "Nom",
    description: "Description",
    mapDescription: "Description de la carte",
    new: "Nouveau",
    edit: "Modifier",
    delete: "Supprimer",
    canvasSize: "Taille du canevas",
    auto: "Auto",
    manual: "Manuel",
    cells: "cellules",
    rows: "Lignes",
    columns: "Colonnes",
    grid: "Grille",
    tools: "Outils",
    brush: "Pinceau",
    image: "Image",
    undo: "Annuler",
    redo: "Rétablir",
    uploadImage: "Télécharger une image",
    replaceImage: "Remplacer l’image",
    clearImage: "Supprimer l’image",
    showImage: "Afficher l’image",
    palette: "Palette",
    brushColor: "Couleur du pinceau",
    newCells: "Nouvelles cellules",
    myColors: "Mes couleurs",
    addColor: "Ajouter",
    imageMap: "Carte image",
    freeDrawing: "Dessin libre",
    newMap: "Nouvelle carte",
    preview: "Aperçu",
    filled: "rempli",
    painted: "Peintes",
    total: "Total",
    clearProgress: "Effacer la progression",
    drawHint: "Clic gauche — dessiner · clic droit — effacer",
    mapsEmpty: "Aucune carte pour le moment",
    open: "Ouvrir",
    createMap: "Créer une carte",
    renameMap: "Renommer",
    newName: "Nouveau nom",
    mapType: "Type de carte",
    cancel: "Annuler",
    deleteMap: "Supprimer la carte",
    account: "Compte personnel",
    logout: "Se déconnecter",
    accountMaps: "Cartes créées",
    accountCells: "Cellules remplies",
    accountDescription:
      "Tes statistiques, cartes et futurs succès apparaîtront ici.",
    accountProgress: "Progression",
    accountMember: "Profil",
  },

  it: {
    myMaps: "Le mie mappe",
    editor: "editor",
    save: "Salva",
    mapData: "Dati mappa",
    name: "Nome",
    description: "Descrizione",
    mapDescription: "Descrizione della mappa",
    new: "Nuova",
    edit: "Modifica",
    delete: "Elimina",
    canvasSize: "Dimensioni tela",
    auto: "Auto",
    manual: "Manuale",
    cells: "celle",
    rows: "Righe",
    columns: "Colonne",
    grid: "Griglia",
    tools: "Strumenti",
    brush: "Pennello",
    image: "Immagine",
    undo: "Annulla",
    redo: "Ripeti",
    uploadImage: "Carica immagine",
    replaceImage: "Sostituisci immagine",
    clearImage: "Rimuovi immagine",
    showImage: "Mostra immagine",
    palette: "Tavolozza",
    brushColor: "Colore pennello",
    newCells: "Nuove celle",
    myColors: "I miei colori",
    addColor: "Aggiungi",
    imageMap: "Mappa immagine",
    freeDrawing: "Disegno libero",
    newMap: "Nuova mappa",
    preview: "Anteprima",
    filled: "completato",
    painted: "Colorate",
    total: "Totale",
    clearProgress: "Cancella progresso",
    drawHint: "Clic sinistro — disegna · clic destro — cancella",
    mapsEmpty: "Non hai ancora mappe",
    open: "Apri",
    createMap: "Crea mappa",
    renameMap: "Rinomina mappa",
    newName: "Nuovo nome",
    mapType: "Tipo di mappa",
    cancel: "Annulla",
    deleteMap: "Elimina mappa",
    account: "Account personale",
    logout: "Esci",
    accountMaps: "Mappe create",
    accountCells: "Celle colorate",
    accountDescription:
      "Qui appariranno le tue statistiche, mappe e futuri risultati.",
    accountProgress: "Progresso",
    accountMember: "Profilo",
  },

  pt: {
    myMaps: "Meus mapas",
    editor: "editor",
    save: "Salvar",
    mapData: "Dados do mapa",
    name: "Nome",
    description: "Descrição",
    mapDescription: "Descrição do mapa",
    new: "Novo",
    edit: "Editar",
    delete: "Excluir",
    canvasSize: "Tamanho da tela",
    auto: "Auto",
    manual: "Manual",
    cells: "células",
    rows: "Linhas",
    columns: "Colunas",
    grid: "Grade",
    tools: "Ferramentas",
    brush: "Pincel",
    image: "Imagem",
    undo: "Desfazer",
    redo: "Refazer",
    uploadImage: "Enviar imagem",
    replaceImage: "Trocar imagem",
    clearImage: "Remover imagem",
    showImage: "Mostrar imagem",
    palette: "Paleta",
    brushColor: "Cor do pincel",
    newCells: "Novas células",
    myColors: "Minhas cores",
    addColor: "Adicionar",
    imageMap: "Mapa de imagem",
    freeDrawing: "Desenho livre",
    newMap: "Novo mapa",
    preview: "Pré-visualização",
    filled: "preenchido",
    painted: "Pintadas",
    total: "Total",
    clearProgress: "Limpar progresso",
    drawHint: "Clique esquerdo — desenhar · direito — apagar",
    mapsEmpty: "Você ainda não tem mapas",
    open: "Abrir",
    createMap: "Criar mapa",
    renameMap: "Renomear mapa",
    newName: "Novo nome",
    mapType: "Tipo de mapa",
    cancel: "Cancelar",
    deleteMap: "Excluir mapa",
    account: "Conta pessoal",
    logout: "Sair",
    accountMaps: "Mapas criados",
    accountCells: "Células preenchidas",
    accountDescription:
      "Aqui aparecerão suas estatísticas, mapas e futuras conquistas.",
    accountProgress: "Progresso",
    accountMember: "Perfil",
  },

  zh: {
    myMaps: "我的地图",
    editor: "编辑器",
    save: "保存",
    mapData: "地图数据",
    name: "名称",
    description: "描述",
    mapDescription: "地图描述",
    new: "新建",
    edit: "编辑",
    delete: "删除",
    canvasSize: "画布大小",
    auto: "自动",
    manual: "手动",
    cells: "格",
    rows: "行",
    columns: "列",
    grid: "网格",
    tools: "工具",
    brush: "画笔",
    image: "图片",
    undo: "撤销",
    redo: "重做",
    uploadImage: "上传图片",
    replaceImage: "替换图片",
    clearImage: "删除图片",
    showImage: "显示图片",
    palette: "调色板",
    brushColor: "画笔颜色",
    newCells: "新格子",
    myColors: "我的颜色",
    addColor: "添加",
    imageMap: "图片地图",
    freeDrawing: "自由绘图",
    newMap: "新地图",
    preview: "预览",
    filled: "已完成",
    painted: "已填充",
    total: "总计",
    clearProgress: "清除进度",
    drawHint: "左键 — 绘制 · 右键 — 擦除",
    mapsEmpty: "还没有地图",
    open: "打开",
    createMap: "创建地图",
    renameMap: "重命名地图",
    newName: "新名称",
    mapType: "地图类型",
    cancel: "取消",
    deleteMap: "删除地图",
    account: "个人账户",
    logout: "退出",
    accountMaps: "创建的地图",
    accountCells: "已填充格子",
    accountDescription: "这里将显示你的统计数据、地图和未来成就。",
    accountProgress: "进度",
    accountMember: "个人资料",
  },

  ko: {
    myMaps: "내 지도",
    editor: "에디터",
    save: "저장",
    mapData: "지도 정보",
    name: "이름",
    description: "설명",
    mapDescription: "지도 설명",
    new: "새로 만들기",
    edit: "편집",
    delete: "삭제",
    canvasSize: "캔버스 크기",
    auto: "자동",
    manual: "수동",
    cells: "칸",
    rows: "행",
    columns: "열",
    grid: "격자",
    tools: "도구",
    brush: "브러시",
    image: "이미지",
    undo: "실행 취소",
    redo: "다시 실행",
    uploadImage: "이미지 업로드",
    replaceImage: "이미지 변경",
    clearImage: "이미지 삭제",
    showImage: "이미지 표시",
    palette: "팔레트",
    brushColor: "브러시 색상",
    newCells: "새 칸",
    myColors: "내 색상",
    addColor: "추가",
    imageMap: "이미지 지도",
    freeDrawing: "자유 그리기",
    newMap: "새 지도",
    preview: "미리보기",
    filled: "완료",
    painted: "칠한 칸",
    total: "전체",
    clearProgress: "진행률 초기화",
    drawHint: "왼쪽 클릭 — 그리기 · 오른쪽 클릭 — 지우기",
    mapsEmpty: "아직 지도가 없습니다",
    open: "열기",
    createMap: "지도 만들기",
    renameMap: "지도 이름 변경",
    newName: "새 이름",
    mapType: "지도 유형",
    cancel: "취소",
    deleteMap: "지도 삭제",
    account: "개인 계정",
    logout: "로그아웃",
    accountMaps: "생성한 지도",
    accountCells: "채운 칸",
    accountDescription:
      "여기에 통계, 지도 및 앞으로의 성과가 표시됩니다.",
    accountProgress: "진행",
    accountMember: "프로필",
  },
};

const additionalTranslations = {
  ru: {
    home: "Главная",
    hero: "Превращай прогресс в карту",
    heroText: "Создавай карты и постепенно заполняй их маленькими шагами.",
    progress: "Прогресс",
    saved: "Сохранено",
    benefitOne: "Визуальный путь",
    benefitTwo: "Гибкая сетка",
    benefitThree: "Твой темп",
  },

  en: {
    home: "Home",
    hero: "Turn progress into a map",
    heroText: "Create maps and fill them step by step.",
    progress: "Progress",
    saved: "Saved",
    benefitOne: "Visual path",
    benefitTwo: "Flexible grid",
    benefitThree: "Your pace",
  },

  es: {
    home: "Inicio",
    hero: "Convierte el progreso en un mapa",
    heroText: "Crea mapas y llénalos paso a paso.",
    progress: "Progreso",
    saved: "Guardado",
    benefitOne: "Camino visual",
    benefitTwo: "Cuadrícula flexible",
    benefitThree: "A tu ritmo",
  },

  ja: {
    home: "ホーム",
    hero: "進捗を地図に変えよう",
    heroText: "マップを作り、少しずつ埋めていきましょう。",
    progress: "進捗",
    saved: "保存しました",
    benefitOne: "視覚的な道筋",
    benefitTwo: "柔軟なグリッド",
    benefitThree: "自分のペース",
  },

  de: {
    home: "Startseite",
    hero: "Mach Fortschritt zur Karte",
    heroText: "Erstelle Karten und fülle sie Schritt für Schritt.",
    progress: "Fortschritt",
    saved: "Gespeichert",
    benefitOne: "Visueller Weg",
    benefitTwo: "Flexibles Raster",
    benefitThree: "Dein Tempo",
  },

  fr: {
    home: "Accueil",
    hero: "Transformez le progrès en carte",
    heroText: "Créez des cartes et remplissez-les pas à pas.",
    progress: "Progression",
    saved: "Enregistré",
    benefitOne: "Parcours visuel",
    benefitTwo: "Grille flexible",
    benefitThree: "Votre rythme",
  },

  it: {
    home: "Home",
    hero: "Trasforma il progresso in una mappa",
    heroText: "Crea mappe e riempile passo dopo passo.",
    progress: "Progresso",
    saved: "Salvato",
    benefitOne: "Percorso visivo",
    benefitTwo: "Griglia flessibile",
    benefitThree: "Il tuo ritmo",
  },

  pt: {
    home: "Início",
    hero: "Transforme o progresso em um mapa",
    heroText: "Crie mapas e preencha-os passo a passo.",
    progress: "Progresso",
    saved: "Salvo",
    benefitOne: "Caminho visual",
    benefitTwo: "Grade flexível",
    benefitThree: "Seu ritmo",
  },

  zh: {
    home: "主页",
    hero: "把进度变成地图",
    heroText: "创建地图，循序渐进地填满它。",
    progress: "进度",
    saved: "已保存",
    benefitOne: "可视化路径",
    benefitTwo: "灵活网格",
    benefitThree: "你的节奏",
  },

  ko: {
    home: "홈",
    hero: "진행 상황을 지도로 바꾸세요",
    heroText: "지도를 만들고 한 칸씩 채워 보세요.",
    progress: "진행",
    saved: "저장됨",
    benefitOne: "시각적 경로",
    benefitTwo: "유연한 격자",
    benefitThree: "나만의 속도",
  },
};

function createMapId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function normalizeHexColor(c) {
  if (typeof c !== "string") return null;

  const v = c.trim().toLowerCase();

  return /^#[0-9a-f]{6}$/i.test(v) ? v : null;
}

function sampleImageColors(img, cols, rows, offset, total) {
  const canvas = document.createElement("canvas");
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas недоступен для обработки изображения");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, cols, rows);
  // Keep the complete source inside full rows; a partial tail must not crop it.
  const placement = imagePlacement(img.width, img.height, cols, rows, total, offset);
  ctx.drawImage(img, placement.left, placement.top, placement.width, placement.height);
  const data = ctx.getImageData(0, 0, cols, rows).data;
  return Array.from({ length: Math.min(MAX_CELLS, cols * rows) }, (_, i) => `rgb(${data[i * 4]}, ${data[i * 4 + 1]}, ${data[i * 4 + 2]})`);
}

function getActivityDate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function cellWord(count) {
  const value = Math.abs(Number(count) || 0);
  const lastTwo = value % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return "клеток";
  const last = value % 10;
  if (last === 1) return "клетка";
  if (last >= 2 && last <= 4) return "клетки";
  return "клеток";
}

function dailyPlanCompleted(map, total, filled, today = new Date()) {
  const plan = getDailyPlanProgress(map, total, filled, today);
  return Boolean(plan && plan.paintedToday >= plan.target);
}

function getDailyPlanProgress(map, total, filled, today = new Date()) {
  const adaptive = map ? adaptiveDailyTarget(map, today) : null;
  if (!map?.deadline || !total || adaptive?.paused) return null;
  const [year, month, day] = map.deadline.split("-").map(Number);
  const end = Date.UTC(year, month - 1, day);
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((end - start) / 86400000) + 1;
  if (!Number.isFinite(end) || days <= 0) return null;
  const todayKey = getActivityDate(today);
  const paintedToday = (map.activityLog || [])
    .filter((entry) => entry.date === todayKey)
    .reduce((sum, entry) => sum + Number(entry.cells || 0), 0);
  const filledBeforeToday = Math.max(0, filled - paintedToday);
  const multiplier = PLAN_MODES[adaptive?.mode]?.multiplier || 1;
  const target = Math.max(1, Math.ceil(Math.max(0, total - filledBeforeToday) / days * multiplier));
  return target > 0 ? { target, paintedToday, days } : null;
}

function dailyQuotaMet(map, total, filled, today = new Date()) {
  const adaptive = map ? adaptiveDailyTarget(map, today) : null;
  if (!map?.deadline || !total || adaptive?.paused) return false;
  const [year, month, day] = map.deadline.split("-").map(Number);
  const end = Date.UTC(year, month - 1, day);
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((end - start) / 86400000) + 1;
  if (!Number.isFinite(end) || days <= 0) return false;
  const todayKey = getActivityDate(today);
  const paintedToday = (map.activityLog || []).filter((entry) => entry.date === todayKey).reduce((sum, entry) => sum + Number(entry.cells || 0), 0);
  const filledBeforeToday = Math.max(0, filled - paintedToday);
  const multiplier = PLAN_MODES[adaptive?.mode]?.multiplier || 1;
  const target = Math.max(1, Math.ceil(Math.max(0, total - filledBeforeToday) / days * multiplier));
  return target > 0 && paintedToday >= target;
}

function normalizeActivityLog(value) {
  const totals = new Map();

  (Array.isArray(value) ? value : []).forEach((entry) => {
    const date = typeof entry?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entry.date)
      ? entry.date
      : null;
    const cells = Math.max(0, Math.floor(Number(entry?.cells) || 0));

    if (date && cells) totals.set(date, (totals.get(date) || 0) + cells);
  });

  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-730)
    .map(([date, cells]) => ({ date, cells }));
}

function normalizeMap(map = {}) {
  const mapLimit = getGridDimensions(
    Math.max(1, Number(map.totalCells) || 500),
    Number(map.imageRatio) > 0 ? Number(map.imageRatio) : 1,
    map.gridMode === "manual" ? "manual" : "auto",
    map.manualRows,
    map.manualCols
  ).actualTotal;
  const drawing = new Set((Array.isArray(map.completed) ? map.completed : []).map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < mapLimit));
  const custom = [
    ...new Set(
      (Array.isArray(map.customColors) ? map.customColors : [])
        .map(normalizeHexColor)
        .filter(Boolean)
        .filter((c) => !BASIC_COLORS.includes(c))
    ),
  ];
  const normalizeModeDraft = (draft, type) => {
    if (!draft || typeof draft !== "object") return null;
    const draftDrawing = new Set(
      (Array.isArray(draft.completed) ? draft.completed : [])
        .map(Number)
        .filter((i) => Number.isInteger(i) && i >= 0 && i < mapLimit)
    );

    return {
      completed: [...draftDrawing],
      progressCompleted: [
        ...new Set(
          (Array.isArray(draft.progressCompleted) ? draft.progressCompleted : [])
            .map(Number)
            .filter((i) => Number.isInteger(i) && i >= 0 && i < mapLimit)
            .filter((i) => type === "image" || draftDrawing.has(i))
        ),
      ],
      colors: Array.isArray(draft.colors) ? draft.colors.slice(0, mapLimit) : [],
      imageOffset: normalizeImageOffset(draft.imageOffset),
      showImage: type === "image" && draft.showImage !== false,
    };
  };
  const freeDraft = normalizeModeDraft(map.modeDrafts?.free, "free");
  const imageDraft = normalizeModeDraft(map.modeDrafts?.image, "image");

  return {
    id: map.id || createMapId(),
    order: Number.isFinite(map.order) ? map.order : 0,
    imageOffset: normalizeImageOffset(map.imageOffset),
    name: typeof map.name === "string" ? map.name : "Моя карта",
    mapType: map.mapType === "image" ? "image" : "free",
    isGameMode: Boolean(map.isGameMode),
    gridMode: map.gridMode === "manual" ? "manual" : "auto",
    completed: [...drawing],
    progressCompleted: [
      ...new Set(
        (Array.isArray(map.progressCompleted) ? map.progressCompleted : [])
          .map(Number)
          .filter(Number.isInteger)
          .filter((i) => i >= 0 && i < mapLimit)
          .filter((i) => map.mapType === "image" || drawing.has(i))
      ),
    ],
    // Прогресс не должен выходить за пределы самой карты.
    progressExtra: 0,
    image: typeof map.image === "string" ? map.image : null,
    colors: Array.isArray(map.colors) ? map.colors.slice(0, mapLimit) : [],
    customColors: custom,
    drawColor: normalizeHexColor(map.drawColor) || BASIC_COLORS[0],
    imageRatio: Number(map.imageRatio) > 0 ? Number(map.imageRatio) : 1,
    totalCells: String(Math.min(MAX_CELLS, Math.max(1, Math.floor(Number(map.totalCells) || 500)))),
    manualRows: String(getGridDimensions(MAX_CELLS, 1, "manual", map.manualRows || 20, map.manualCols || 25).rows),
    manualCols: String(getGridDimensions(MAX_CELLS, 1, "manual", map.manualRows || 20, map.manualCols || 25).cols),

    showImage:
      typeof map.showImage === "boolean" ? map.showImage : true,
    description:
      typeof map.description === "string" ? map.description : "",
    category: typeof map.category === "string" && map.category.trim().slice(0, 36) ? map.category.trim().slice(0, 36) : "Личное",
    deadline: /^\d{4}-\d{2}-\d{2}$/.test(map.deadline || "") ? map.deadline : "",
    lastPaintedAt: typeof map.lastPaintedAt === "string" && Number.isFinite(Date.parse(map.lastPaintedAt))
      ? map.lastPaintedAt
      : "",
    activityLog: normalizeActivityLog(map.activityLog),
    dailyPlanDoneOn: /^\d{4}-\d{2}-\d{2}$/.test(map.dailyPlanDoneOn || "") ? map.dailyPlanDoneOn : "",
    createdAt: typeof map.createdAt === "string" && Number.isFinite(Date.parse(map.createdAt)) ? map.createdAt : "",
    completedAt: typeof map.completedAt === "string" && Number.isFinite(Date.parse(map.completedAt)) ? map.completedAt : "",
    planMode: PLAN_MODES[map.planMode] ? map.planMode : "balanced",
    planPausedUntil: /^\d{4}-\d{2}-\d{2}$/.test(map.planPausedUntil || "") ? map.planPausedUntil : "",
    versions: normalizeVersions(map.versions),
    cellSequence: (Array.isArray(map.cellSequence) ? map.cellSequence : [])
      .slice(0, MAX_CELLS * 4)
      .map(Number)
      .filter((entry) => Number.isInteger(entry) && entry >= -MAX_CELLS && entry < MAX_CELLS),
    shareId: typeof map.shareId === "string" && /^[0-9a-f-]{36}$/i.test(map.shareId) ? map.shareId : "",
    privateLibraryItem: Boolean(map.privateLibraryItem),
    modeDrafts: {
      ...(freeDraft ? { free: freeDraft } : {}),
      ...(imageDraft ? { image: imageDraft } : {}),
    },
  };
}

function saveMapsLocally(maps) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(maps.map(normalizeMap))
    );
  } catch (error) {
    // Большие исходные изображения могут не поместиться в localStorage.
    // Карта остаётся открытой и продолжает сохраняться в удалённое хранилище.
    console.warn("Не удалось сохранить карты локально:", error);
  }
}

function getInitialData() {
  try {
    const maps = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || "[]"
    ).map(normalizeMap);

    const active = localStorage.getItem(ACTIVE_MAP_KEY);

    return {
      maps,
      activeMap:
        maps.find((m) => m.id === active)?.id ||
        maps[0]?.id ||
        null,
    };
  } catch {
    return {
      maps: [],
      activeMap: null,
    };
  }
}

function mapToSupabaseRow(map, userId) {
  const { id, name, ...data } = normalizeMap(map);

  return {
    id,
    user_id: userId,
    name,
    data,
  };
}

function mapFromSupabaseRow(row) {
  return normalizeMap({
    ...row.data,
    createdAt: row.data?.createdAt || row.created_at || "",
    id: row.id,
    name: row.name,
  });
}

const MapCardGrid = memo(function MapCardGrid({ map, dimensions, cropToDrawing = false, previewBounds = null, animateChanges = false, animationKey = "", showTemplate = true, playbackActive = false, playbackSpeedRef = null }) {
  const canvasRef = useRef(null);
  const previewAnimationFrameRef = useRef(0);
  const previousPreviewMapRef = useRef(map);
  const previousPreviewModeRef = useRef(showTemplate);
  const completedCells = new Set(map.progressCompleted || []);
  const drawingCells = new Set(map.completed || []);
  const densePreview = dimensions.actualTotal >= 2000;
  const meaningfulCells = [...drawingCells].filter((index) => (
    map.mapType !== "free" || normalizeHexColor(map.colors?.[index]) !== UTILITY_COLOR
  ));
  let startRow = 0;
  let endRow = dimensions.rows - 1;
  let startCol = 0;
  let endCol = dimensions.cols - 1;
  if (cropToDrawing && meaningfulCells.length) {
    const drawingRows = meaningfulCells.map((index) => Math.floor(index / dimensions.cols));
    const drawingCols = meaningfulCells.map((index) => index % dimensions.cols);
    startRow = Math.max(0, Math.min(...drawingRows) - 1);
    endRow = Math.min(dimensions.rows - 1, Math.max(...drawingRows) + 1);
    startCol = Math.max(0, Math.min(...drawingCols) - 1);
    endCol = Math.min(dimensions.cols - 1, Math.max(...drawingCols) + 1);
  }
  const visibleRows = endRow - startRow + 1;
  const visibleCols = endCol - startCol + 1;
  const previewWidth = previewBounds?.width || 330;
  const previewHeight = previewBounds?.height || 204;
  const previewCellSize = cropToDrawing
    ? previewBounds
      ? Math.max(0.35, Math.min(16, previewWidth / visibleCols, previewHeight / visibleRows))
      : Math.max(3, Math.min(16, Math.floor(Math.min(
          (previewWidth - Math.max(0, visibleCols - 1)) / visibleCols,
          (previewHeight - Math.max(0, visibleRows - 1)) / visibleRows
        ))))
    : null;
  const visibleIndices = Array.from({ length: visibleRows * visibleCols }, (_, index) => (
    (startRow + Math.floor(index / visibleCols)) * dimensions.cols + startCol + (index % visibleCols)
  )).filter((index) => index < dimensions.actualTotal);

  const getCellAppearance = (index) => {
    const utilityCell = map.mapType === "free" && normalizeHexColor(map.colors?.[index]) === UTILITY_COLOR;
    const filled = completedCells.has(index) && !utilityCell;
    const backgroundDrawingCell = !utilityCell && (map.mapType === "image" || drawingCells.has(index));
    return {
      filled,
      color: filled
        ? map.colors?.[index] || "#32624f"
        : backgroundDrawingCell
          ? map.colors?.[index] || "#aeb5ad"
          : "#deded8",
      opacity: filled
        ? 1
        : backgroundDrawingCell
          ? densePreview ? 0.38 : 0.52
          : densePreview ? 0.34 : 0.62,
    };
  };

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const preview = canvas?.parentElement;
    if (cropToDrawing || !canvas || !preview) return undefined;
    const previousFrame = animateChanges && canvas.width && canvas.height
      ? Object.assign(document.createElement("canvas"), { width: canvas.width, height: canvas.height })
      : null;
    previousFrame?.getContext("2d")?.drawImage(canvas, 0, 0);
    const previousMap = previousPreviewMapRef.current;
    const previousProgressCells = new Set(previousMap.progressCompleted || []);
    const previousTemplateCells = new Set(previousMap.completed || []);
    const progressCells = new Set(map.progressCompleted || []);
    const templateCells = new Set(map.completed || []);
    const playbackSequence = playbackActive && Array.isArray(map.cellSequence) ? map.cellSequence : [];
    const animateWholeFrame = previousPreviewModeRef.current !== showTemplate;
    const changedIndices = animateChanges && !animateWholeFrame
      ? visibleIndices.filter((index) => {
          const previousUtility = previousMap.mapType === "free" && normalizeHexColor(previousMap.colors?.[index]) === UTILITY_COLOR;
          const utility = map.mapType === "free" && normalizeHexColor(map.colors?.[index]) === UTILITY_COLOR;
          const previousFilled = previousProgressCells.has(index) && !previousUtility;
          const filled = progressCells.has(index) && !utility;
          const previousBackground = showTemplate && !previousUtility && (previousMap.mapType === "image" || previousTemplateCells.has(index));
          const background = showTemplate && !utility && (map.mapType === "image" || templateCells.has(index));
          return previousFilled !== filled
            || previousBackground !== background
            || (previousFilled || filled || previousBackground || background)
              && normalizeHexColor(previousMap.colors?.[index]) !== normalizeHexColor(map.colors?.[index]);
        })
      : [];
    previousPreviewMapRef.current = map;
    previousPreviewModeRef.current = showTemplate;
    // Layout dimensions must never include the ancestor's temporary FLIP scale.
    // Observe the canvas content box, not its transformed screen rectangle.
    let displayedProgressCells = progressCells;
    let displayedTemplateCells = templateCells;
    const draw = (entries, transition = 1, activeProgressCells = displayedProgressCells, activeTemplateCells = displayedTemplateCells) => {
      const bounds = entries?.[0]?.contentRect;
      const cssWidth = bounds?.width ?? canvas.clientWidth;
      const cssHeight = bounds?.height ?? canvas.clientHeight;
      if (cssWidth <= 0 || cssHeight <= 0) return;
      const pixelRatio = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(cssWidth * pixelRatio));
      const height = Math.max(1, Math.round(cssHeight * pixelRatio));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      const context = canvas.getContext("2d", { alpha: true });
      context.clearRect(0, 0, width, height);
      const cellSize = Math.min(width / visibleCols, height / visibleRows);
      const gridWidth = cellSize * visibleCols;
      const gridHeight = cellSize * visibleRows;
      const offsetX = Math.max(0, Math.round((width - gridWidth) / 2));
      const offsetY = Math.max(0, Math.round((height - gridHeight) / 2));
      const gap = !densePreview && cellSize >= 6 ? 1 : 0;
      visibleIndices.forEach((index) => {
        const utilityCell = map.mapType === "free" && normalizeHexColor(map.colors?.[index]) === UTILITY_COLOR;
        const filled = activeProgressCells.has(index) && !utilityCell;
        const backgroundDrawingCell = showTemplate && !utilityCell && (map.mapType === "image" || activeTemplateCells.has(index));
        context.fillStyle = filled
          ? map.colors?.[index] || "#32624f"
          : backgroundDrawingCell
            ? map.colors?.[index] || "#aeb5ad"
            : "#deded8";
        context.globalAlpha = filled
          ? 1
          : backgroundDrawingCell
            ? densePreview ? 0.38 : 0.52
            : densePreview ? 0.34 : 0.62;
        const row = Math.floor(index / dimensions.cols) - startRow;
        const column = index % dimensions.cols - startCol;
        // Adjacent cells share the exact same rounded boundary: no seams,
        // overlaps or cropping, including when a cell is smaller than a pixel.
        const left = Math.round(offsetX + column * cellSize);
        const top = Math.round(offsetY + row * cellSize);
        const right = Math.round(offsetX + (column + 1) * cellSize);
        const bottom = Math.round(offsetY + (row + 1) * cellSize);
        context.fillRect(left, top, Math.max(0, right - left - gap), Math.max(0, bottom - top - gap));
      });
      context.globalAlpha = 1;
      if (previousFrame && previousFrame.width === width && previousFrame.height === height && transition < 1) {
        context.globalAlpha = 1 - transition;
        if (animateWholeFrame) {
          context.drawImage(previousFrame, 0, 0);
        } else {
          changedIndices.forEach((index) => {
            const row = Math.floor(index / dimensions.cols) - startRow;
            const column = index % dimensions.cols - startCol;
            const left = Math.round(offsetX + column * cellSize);
            const top = Math.round(offsetY + row * cellSize);
            const right = Math.round(offsetX + (column + 1) * cellSize);
            const bottom = Math.round(offsetY + (row + 1) * cellSize);
            const cellWidth = Math.max(0, right - left - gap);
            const cellHeight = Math.max(0, bottom - top - gap);
            if (cellWidth && cellHeight) {
              context.drawImage(previousFrame, left, top, cellWidth, cellHeight, left, top, cellWidth, cellHeight);
            }
          });
        }
        context.globalAlpha = 1;
      }
    };
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let transitionProgress = previousFrame && !reducedMotion ? 0 : 1;
    if (previousFrame && !reducedMotion && playbackSequence.length && !animateWholeFrame) {
      const workingProgress = new Set(previousProgressCells);
      const workingTemplate = new Set(previousTemplateCells);
      const sequenceTarget = map.isGameMode ? workingProgress : workingTemplate;
      let sequenceCursor = 0;
      let sequenceProgress = 0;
      let previousTime = 0;
      displayedProgressCells = workingProgress;
      displayedTemplateCells = workingTemplate;
      draw(undefined, 1, workingProgress, workingTemplate);

      const animateSequence = (now) => {
        const lastTime = previousTime || now;
        previousTime = now;
        sequenceProgress = Math.min(
          1,
          sequenceProgress + (now - lastTime) / (800 / Math.max(0.25, playbackSpeedRef?.current || 1))
        );
        const nextCursor = Math.min(playbackSequence.length, Math.floor(sequenceProgress * playbackSequence.length));
        while (sequenceCursor < nextCursor) {
          const encoded = playbackSequence[sequenceCursor];
          const index = encoded >= 0 ? encoded : -encoded - 1;
          if (encoded >= 0) sequenceTarget.add(index);
          else sequenceTarget.delete(index);
          sequenceCursor += 1;
        }
        draw(undefined, 1, workingProgress, workingTemplate);
        if (sequenceProgress < 1) {
          previewAnimationFrameRef.current = window.requestAnimationFrame(animateSequence);
        } else {
          displayedProgressCells = progressCells;
          displayedTemplateCells = templateCells;
          draw();
        }
      };
      previewAnimationFrameRef.current = window.requestAnimationFrame(animateSequence);
    } else if (previousFrame && !reducedMotion) {
      const startedAt = performance.now();
      const animate = (now) => {
        const progress = Math.min(1, (now - startedAt) / 300);
        transitionProgress = 1 - Math.pow(1 - progress, 3);
        draw(undefined, transitionProgress);
        if (progress < 1) previewAnimationFrameRef.current = window.requestAnimationFrame(animate);
      };
      previewAnimationFrameRef.current = window.requestAnimationFrame(animate);
    } else {
      draw();
    }
    const observer = new ResizeObserver((entries) => draw(entries, transitionProgress));
    observer.observe(canvas);
    const redraw = () => draw(undefined, transitionProgress);
    window.addEventListener("resize", redraw);
    return () => {
      window.cancelAnimationFrame(previewAnimationFrameRef.current);
      observer.disconnect();
      window.removeEventListener("resize", redraw);
    };
  }, [map, dimensions.cols, cropToDrawing, visibleCols, visibleRows, startRow, startCol, densePreview, visibleIndices, animateChanges, animationKey, showTemplate, playbackActive, playbackSpeedRef]);

  if (!cropToDrawing) {
    return (
      <canvas
        ref={canvasRef}
        className="map-preview-canvas"
        aria-hidden="true"
      />
    );
  }

  return (
    <div
      className={`map-card-grid${densePreview ? " is-dense" : ""}${previewBounds ? " is-bounded-preview" : ""}`}
      style={{
        "--preview-ratio": visibleCols / visibleRows,
        gridTemplateColumns: cropToDrawing
          ? `repeat(${visibleCols},${previewCellSize}px)`
          : `repeat(${visibleCols},minmax(0,1fr))`,
        gridAutoRows: cropToDrawing ? `${previewCellSize}px` : undefined,
        aspectRatio: cropToDrawing ? "auto" : `${visibleCols}/${visibleRows}`,
      }}
    >
      {visibleIndices.map((index) => {
        const cell = getCellAppearance(index);
        return (
          <span
            key={index}
            className={`map-card-cell${cell.filled ? " filled" : ""}`}
            style={{
              backgroundColor: cell.color,
              opacity: cell.opacity,
            }}
          />
        );
      })}
    </div>
  );
}, (previous, next) => (previous.animationKey || next.animationKey ? previous.animationKey === next.animationKey : previous.map === next.map)
  && previous.dimensions.cols === next.dimensions.cols
  && previous.dimensions.rows === next.dimensions.rows
  && previous.dimensions.actualTotal === next.dimensions.actualTotal
  && previous.cropToDrawing === next.cropToDrawing
  && previous.animateChanges === next.animateChanges
  && previous.showTemplate === next.showTemplate
  && previous.playbackActive === next.playbackActive
  && previous.previewBounds?.width === next.previewBounds?.width
  && previous.previewBounds?.height === next.previewBounds?.height);



function getLineCells(a, b, cols, rows) {
  let row = Math.floor(a / cols);
  let col = a % cols;
  const endRow = Math.floor(b / cols);
  const endCol = b % cols;
  const deltaCol = Math.abs(endCol - col);
  const deltaRow = Math.abs(endRow - row);
  const stepCol = col < endCol ? 1 : -1;
  const stepRow = row < endRow ? 1 : -1;
  let error = deltaCol - deltaRow;
  const out = [];

  // Суперпокрывающий вариант Брезенхэма: отмечает каждую клетку,
  // через которую прошёл курсор, даже когда события мыши редкие.
  while (true) {
    if (row >= 0 && row < rows && col >= 0 && col < cols) {
      out.push(row * cols + col);
    }
    if (row === endRow && col === endCol) break;

    const twiceError = error * 2;
    if (twiceError > -deltaRow) {
      error -= deltaRow;
      col += stepCol;
    }
    if (twiceError < deltaCol) {
      error += deltaCol;
      row += stepRow;
    }
  }

  return out;
}

function AnimatedSelect({ value, onChange, options, placeholder, ariaLabel }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const rootRef = useRef(null);
  const closeTimerRef = useRef(null);
  const normalizedOptions = options.map((option) => typeof option === "string" ? { value: option, label: option } : option);
  const selected = normalizedOptions.find((option) => String(option.value) === String(value));

  function closeMenu() {
    if (!isOpen) return;
    setIsOpen(false);
    setIsClosing(true);
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => setIsClosing(false), 180);
  }

  useEffect(() => {
    function closeOnOutsidePointer(event) {
      if (!rootRef.current?.contains(event.target)) closeMenu();
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [isOpen]);
  useEffect(() => () => window.clearTimeout(closeTimerRef.current), []);

  return (
    <div className={`animated-select${isOpen ? " is-open" : ""}${isClosing ? " is-closing" : ""}`} ref={rootRef}>
      <button type="button" className="animated-select-trigger" aria-label={ariaLabel} aria-expanded={isOpen} onClick={() => {
        if (isOpen) closeMenu();
        else { window.clearTimeout(closeTimerRef.current); setIsClosing(false); setIsOpen(true); }
      }}>
        <span>{selected?.label || placeholder}</span><i aria-hidden="true" />
      </button>
      {(isOpen || isClosing) && (
        <div className="animated-select-menu" role="listbox">
          {normalizedOptions.map((option) => (
            <button key={option.value} type="button" role="option" aria-selected={String(option.value) === String(value)} className={String(option.value) === String(value) ? "selected" : ""} onClick={() => { onChange(option.value); closeMenu(); }}>
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function GridNumberInput({ value, onChange, ...props }) {
  const [draft, setDraft] = useState(String(value));
  const [previousValue, setPreviousValue] = useState(value);
  if (value !== previousValue) {
    setPreviousValue(value);
    setDraft(String(value));
  }
  return <input {...props} max={MAX_CELLS} step="1" value={draft}
    onChange={(event) => { setDraft(event.target.value); onChange(event); }}
    onBlur={() => setDraft(String(value))} />;
}

function DeadlinePicker({ value, onChange, optional = false }) {
  const parseValue = (date) => {
    const [year = "", month = "", day = ""] = (date || "").split("-");
    return { day: day ? String(Number(day)) : "", month: month ? String(Number(month)) : "", year };
  };
  const [parts, setParts] = useState(() => parseValue(value));
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 12 }, (_, index) => String(currentYear - 1 + index));
  const months = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

  useEffect(() => setParts(parseValue(value)), [value]);

  function updatePart(part, nextValue) {
    const next = { ...parts, [part]: nextValue };
    setParts(next);
    if (!next.day || !next.month || !next.year) {
      onChange("");
      return;
    }
    const lastDay = new Date(Number(next.year), Number(next.month), 0).getDate();
    const safeDay = Math.min(Number(next.day), lastDay);
    onChange(`${next.year}-${String(next.month).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`);
  }

  return (
    <div className="modal-field deadline-field">
      <label>Срок{optional ? " (необязательно)" : ""}</label>
      <div className="deadline-selects">
        <AnimatedSelect ariaLabel="День" value={parts.day} onChange={(next) => updatePart("day", next)} placeholder="День" options={Array.from({ length: 31 }, (_, index) => String(index + 1))} />
        <AnimatedSelect ariaLabel="Месяц" value={parts.month} onChange={(next) => updatePart("month", next)} placeholder="Месяц" options={months.map((month, index) => ({ value: String(index + 1), label: month }))} />
        <AnimatedSelect ariaLabel="Год" value={parts.year} onChange={(next) => updatePart("year", next)} placeholder="Год" options={years} />
      </div>
    </div>
  );
}

function sameState(a, b) {
  return (
    JSON.stringify(a.completed) ===
      JSON.stringify(b.completed) &&
    JSON.stringify(a.colors) ===
      JSON.stringify(b.colors)
  );
}

const AnimatedPercent = memo(function AnimatedPercent({ value }) {
  const target = Math.max(0, Number(value) || 0);
  const currentRef = useRef(target);
  const [current, setCurrent] = useState(target);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      currentRef.current = target;
      setCurrent(target);
      return;
    }
    const start = currentRef.current;
    const startedAt = performance.now();
    let frame = 0;
    const animate = (now) => {
      const progress = Math.min(1, (now - startedAt) / 420);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = start + (target - start) * eased;
      currentRef.current = next;
      setCurrent(next);
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  const rounded = Math.round(current * 10) / 10;
  return <>{Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%</>;
});

const CrossfadeToken = memo(function CrossfadeToken({ value }) {
  const previousValueRef = useRef(value);
  const clearTimerRef = useRef(null);
  const [previousValue, setPreviousValue] = useState(null);

  useLayoutEffect(() => {
    if (previousValueRef.current === value) return undefined;
    setPreviousValue(previousValueRef.current);
    previousValueRef.current = value;
    window.clearTimeout(clearTimerRef.current);
    clearTimerRef.current = window.setTimeout(() => setPreviousValue(null), 520);
    return () => window.clearTimeout(clearTimerRef.current);
  }, [value]);

  return (
    <span className="history-text-token">
      <span className="history-text-current" key={value}>{value}</span>
      {previousValue !== null && <span className="history-text-previous" aria-hidden="true">{previousValue}</span>}
    </span>
  );
});

const CrossfadeText = memo(function CrossfadeText({ value, as: Tag = "span" }) {
  const tokens = String(value).split(/(\s+|[.,:·/+()\-]+)/).filter(Boolean);
  return (
    <Tag className="history-crossfade-text">
      {tokens.map((token, index) => <CrossfadeToken key={index} value={token} />)}
    </Tag>
  );
});

export default function App() {
  const initial = getInitialData();

  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [mapsLoading, setMapsLoading] = useState(true);
  const [isMapInitialized, setIsMapInitialized] = useState(false);

  const [language, setLanguage] = useState(
    () => localStorage.getItem(LANGUAGE_KEY) || "ru"
  );

  const [screen, setScreen] = useState(() => {
    if (new URLSearchParams(window.location.search).has("shared") || new URLSearchParams(window.location.search).has("snapshot") || new URLSearchParams(window.location.hash.slice(1)).has("snapshot")) return "shared";
    const saved = localStorage.getItem(CURRENT_SCREEN_KEY);

    return [
      "home",
      "maps",
      "editor",
      "account",
      "library",
      "feedback-inbox",
      "analytics",
      "auth",
    ].includes(saved)
      ? saved
      : "home";
  });

  const [maps, setMaps] = useState([]);
  const [publicLibraryDraft, setPublicLibraryDraft] = useState(null);
  const [publicLibraryCategoryDraft, setPublicLibraryCategoryDraft] = useState("Личное");
  const [privateLibrary, setPrivateLibrary] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(PRIVATE_LIBRARY_KEY) || "{}");
    } catch {
      return {};
    }
  });
  const [publicLibrary, setPublicLibrary] = useState(BUILTIN_PUBLIC_LIBRARY);
  const [libraryStatus, setLibraryStatus] = useState("");
  const [librarySearch, setLibrarySearch] = useState("");
  const [librarySort, setLibrarySort] = useState("popular");
  const [libraryCategory, setLibraryCategory] = useState("Все");
  const [favoritesByUser, setFavoritesByUser] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LIBRARY_FAVORITES_KEY) || "{}");
      return saved && !Array.isArray(saved) && typeof saved === "object" ? saved : {};
    } catch { return {}; }
  });
  const [libraryUsage, setLibraryUsage] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LIBRARY_USAGE_KEY) || "{}"); } catch { return {}; }
  });
  const [historyMapId, setHistoryMapId] = useState(null);
  const [historyPreviewIndex, setHistoryPreviewIndex] = useState(0);
  const [historyPlaying, setHistoryPlaying] = useState(false);
  const [historyPlaybackSpeed, setHistoryPlaybackSpeed] = useState(1);
  const [historyViewMode, setHistoryViewMode] = useState("changes");
  const [historyPreviewMode, setHistoryPreviewMode] = useState("template");
  const [historyClosing, setHistoryClosing] = useState(false);
  const [deletingVersionId, setDeletingVersionId] = useState("");
  const [restoredVersionId, setRestoredVersionId] = useState("");
  const [versionUndoNotice, setVersionUndoNotice] = useState(null);
  const [versionUndoClosing, setVersionUndoClosing] = useState(false);
  const [featureStatus, setFeatureStatus] = useState("");
  const [activityClearStatus, setActivityClearStatus] = useState("");
  const [activityClearingDate, setActivityClearingDate] = useState("");
  const featureBusyRef = useRef(false);
  const [shareMap, setShareMap] = useState(null);
  const [shareProgressVisible, setShareProgressVisible] = useState(true);
  const [shareActivityVisible, setShareActivityVisible] = useState(false);
  const [shareStatus, setShareStatus] = useState("");
  const [sharedView, setSharedView] = useState(null);
  const [sharedViewStatus, setSharedViewStatus] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("shared") || params.get("snapshot") || new URLSearchParams(window.location.hash.slice(1)).get("snapshot") ? "loading" : "";
  });
  const [backupStatus, setBackupStatus] = useState("");
  const [syncStatus, setSyncStatus] = useState("");
  const loadedOwnerRef = useRef(null);
  const latestOwnerRef = useRef(null);
  useLayoutEffect(() => { latestOwnerRef.current = user?.id || null; }, [user?.id]);
  const backupInputRef = useRef(null);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [appStandalone, setAppStandalone] = useState(() => isStandaloneApp(window));
  const [appInstalled, setAppInstalled] = useState(false);
  const [appHelpOpen, setAppHelpOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setHistoryMapId(null);
      setHistoryPlaying(false);
      setShareMap(null);
      setOnboardingOpen(false);
      setFeatureStatus("");
      setBackupStatus("");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [user?.id]);
  const [isEditingAccountName, setIsEditingAccountName] = useState(false);
  const [isClosingAccountName, setIsClosingAccountName] = useState(false);
  const [accountNameDraft, setAccountNameDraft] = useState("");
  const [accountNameStatus, setAccountNameStatus] = useState("");
  const [todayKey, setTodayKey] = useState(() => getActivityDate());
  const [activeMapId, setActiveMapId] = useState(null);
  const [todayYear, todayMonth, todayDay] = todayKey.split("-").map(Number);
  const todayDate = new Date(todayYear, todayMonth - 1, todayDay);
  const [saveStatus, setSaveStatus] = useState("");
  const [heroDemoCells, setHeroDemoCells] = useState(
    () => new Set(DEMO_PYRAMID_INITIAL)
  );
  const [showDemoVictory, setShowDemoVictory] = useState(false);
  const [heroNoteCells, setHeroNoteCells] = useState(
    () => new Set([2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 31, 34, 37, 40, 43, 46, 49, 52, 55, 58, 61, 64, 67, 70, 73, 76, 79, 82, 85, 88, 91, 94, 97])
  );
  const [cardDemoCells, setCardDemoCells] = useState(
    () => new Set(Array.from({ length: 50 }, (_, index) => index))
  );
  const [isGameMode, setIsGameMode] = useState(false);
  const [progressCompleted, setProgressCompleted] = useState([]);
  const [progressExtra, setProgressExtra] = useState(0);
  const [isGameFillOpen, setIsGameFillOpen] = useState(false);
  const [gameFillCount, setGameFillCount] = useState("1");
  const [gameFillRandom, setGameFillRandom] = useState(false);
  const [showVictory, setShowVictory] = useState(false);
  const [victoryDismissing, setVictoryDismissing] = useState(false);

  const activeMap =
    maps.find((m) => m.id === activeMapId)
    || (publicLibraryDraft?.id === activeMapId ? publicLibraryDraft : null);

  const [
    mapType,
    setMapType,
  ] = useState("free");

  const [
    gridMode,
    setGridMode,
  ] = useState("auto");

  const [
    completed,
    setCompleted,
  ] = useState([]);

  const [image, setImage] = useState(null);
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 });
  const [gridError, setGridError] = useState("");
  const [rowAddSide, setRowAddSide] = useState(() => localStorage.getItem("mm-row-add-side") === "top" ? "top" : "bottom");
  const [colAddSide, setColAddSide] = useState(() => localStorage.getItem("mm-col-add-side") === "left" ? "left" : "right");
  useEffect(() => {
    localStorage.setItem("mm-row-add-side", rowAddSide);
    localStorage.setItem("mm-col-add-side", colAddSide);
  }, [rowAddSide, colAddSide]);
  const [deletingIds, setDeletingIds] = useState([]);
  const deletingIdsRef = useRef(new Set());
  const deletedMapsRef = useRef([]);
  const restoringDeletedMapRef = useRef(false);
  const [restoredMapIds, setRestoredMapIds] = useState([]);
  const pendingDeletesRef = useRef([]);
  const pendingDeleteTimersRef = useRef(new Map());
  const [pendingDeletes, setPendingDeletes] = useState([]);
  const [deleteCountdownNow, setDeleteCountdownNow] = useState(Date.now());
  const [deleteCollapseHeight, setDeleteCollapseHeight] = useState(0);
  const [mapActionError, setMapActionError] = useState("");
  const [cardDrag, setCardDrag] = useState(null);
  const cardDragRef = useRef(null);
  const [cardSettling, setCardSettling] = useState(null);
  const cardPositionsRef = useRef(null);
  const cardAnimationsRef = useRef([]);
  const suppressCardClick = useRef(false);
  const [categoryDrag, setCategoryDrag] = useState(null);
  const categoryDragRef = useRef(null);
  const suppressCategoryClick = useRef(false);
  const artworkDragRef = useRef(null);
  const artworkDragFrameRef = useRef(0);
  const [movingArtwork, setMovingArtwork] = useState(false);
  const [viewportSize, setViewportSize] = useState({ width: 600, height: 500 });
  const zoomAnchorRef = useRef(null);
  const [colors, setColors] = useState([]);
  const [imageRatio, setImageRatio] = useState(1);

  const [
    drawColor,
    setDrawColor,
  ] = useState(BASIC_COLORS[0]);

  const [
    customColors,
    setCustomColors,
  ] = useState(() => {
    try {
      return JSON.parse(
        localStorage.getItem(CUSTOM_COLORS_KEY) || "[]"
      )
        .filter(Boolean)
        .filter((color) => color.toLowerCase() !== "#ff0000");
    } catch {
      return [];
    }
  });

  const [
    newColor,
    setNewColor,
  ] = useState(BASIC_COLORS[0]);

  const [
    totalCells,
    setTotalCells,
  ] = useState("500");

  const [
    manualRows,
    setManualRows,
  ] = useState("20");

  const [
    manualCols,
    setManualCols,
  ] = useState("25");

  const [
    showImage,
    setShowImage,
  ] = useState(true);

  const [
    description,
    setDescription,
  ] = useState("");

  const [
    activityLog,
    setActivityLog,
  ] = useState([]);

  const [
    isDrawing,
    setIsDrawing,
  ] = useState(false);

  const [, setCellAnimationTick] = useState(0);

  const [
    drawMode,
    setDrawMode,
  ] = useState("draw");

  const [
    isCreateOpen,
    setIsCreateOpen,
  ] = useState(false);

  const [
    isRenameOpen,
    setIsRenameOpen,
  ] = useState(false);

  const [
    isDeleteOpen,
    setIsDeleteOpen,
  ] = useState(false);
  const [closingModal, setClosingModal] = useState("");

  const [
    newMapName,
    setNewMapName,
  ] = useState("");
  const [newMapDescription, setNewMapDescription] = useState("");
  const [newMapCategory, setNewMapCategory] = useState("Личное");
  const [newMapDeadline, setNewMapDeadline] = useState("");
  const [newMapPlanMode, setNewMapPlanMode] = useState("balanced");
  const [newCategoryDraft, setNewCategoryDraft] = useState("");
  const [isLibraryCategoryAdding, setIsLibraryCategoryAdding] = useState(false);
  const [customCategories, setCustomCategories] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CUSTOM_CATEGORIES_KEY) || "[]").filter((item) => typeof item === "string"); }
    catch { return []; }
  });
  const [categoryOrder, setCategoryOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CATEGORY_ORDER_KEY) || "[]").filter((item) => typeof item === "string"); }
    catch { return []; }
  });

  const [
    newMapType,
    setNewMapType,
  ] = useState("free");

  const [
    newMapGridMode,
    setNewMapGridMode,
  ] = useState("auto");

  const [
    newMapCells,
    setNewMapCells,
  ] = useState("500");

  const [
    newMapRows,
    setNewMapRows,
  ] = useState("20");

  const [
    newMapCols,
    setNewMapCols,
  ] = useState("25");

  const [
    renameValue,
    setRenameValue,
  ] = useState("");
  const [renameDescription, setRenameDescription] = useState("");
  const [renameCategory, setRenameCategory] = useState("Личное");
  const [renameDeadline, setRenameDeadline] = useState("");
  const [renamePlanMode, setRenamePlanMode] = useState("balanced");
  const [renamePausedUntil, setRenamePausedUntil] = useState("");
  const [mapCategoryFilter, setMapCategoryFilter] = useState("Все");
  const [mapColumns, setMapColumns] = useState(2);
  const [celebratingAchievements, setCelebratingAchievements] = useState(() => {
    try {
      return new Set(JSON.parse(sessionStorage.getItem(ACHIEVEMENT_SESSION_KEY) || "[]"));
    } catch {
      return new Set();
    }
  });
  const [newAchievementAnimations, setNewAchievementAnimations] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(ACHIEVEMENT_SESSION_KEY) || "[]");
    } catch {
      return [];
    }
  });

  const [
    renameMapId,
    setRenameMapId,
  ] = useState(null);

  const [
    mapToDelete,
    setMapToDelete,
  ] = useState(null);

  const [
    mapZoom,
    setMapZoom,
  ] = useState(1);

  const availableCategories = [...new Set([...MAP_CATEGORIES, ...customCategories])];
  const allCategories = [...categoryOrder.filter((category) => availableCategories.includes(category)), ...availableCategories.filter((category) => !categoryOrder.includes(category))];
  const categoryDragTransform = (category) => {
    if (!categoryDrag || category === "Все") return undefined;
    if (categoryDrag.category === category) return `translate3d(${categoryDrag.dx}px,${categoryDrag.dy}px,0)`;
    const from = categoryDrag.from;
    const to = categoryDrag.targetIndex;
    const index = allCategories.indexOf(category);
    if (from < to && index > from && index <= to) return `translate3d(-${categoryDrag.width + 7}px,0,0)`;
    if (from > to && index >= to && index < from) return `translate3d(${categoryDrag.width + 7}px,0,0)`;
    return undefined;
  };

  const [
    isAccountOpen,
    setIsAccountOpen,
  ] = useState(false);
  const [isAccountClosing, setIsAccountClosing] = useState(false);
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedbackKind, setFeedbackKind] = useState("Предложение");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackEmail, setFeedbackEmail] = useState("");
  const [feedbackFiles, setFeedbackFiles] = useState([]);
  const [feedbackRemovingFile, setFeedbackRemovingFile] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState("");
  const [showFeedbackThanks, setShowFeedbackThanks] = useState(false);
  const [isFeedbackThanksClosing, setIsFeedbackThanksClosing] = useState(false);
  const [feedbackMessages, setFeedbackMessages] = useState([]);
  const [feedbackInboxLoading, setFeedbackInboxLoading] = useState(false);
  const [feedbackInboxFilter, setFeedbackInboxFilter] = useState("all");
  const [feedbackNoteDrafts, setFeedbackNoteDrafts] = useState({});
  const [feedbackAdminState, setFeedbackAdminState] = useState({});
  const [feedbackDeleteTargets, setFeedbackDeleteTargets] = useState([]);
  const [isFeedbackDeleteClosing, setIsFeedbackDeleteClosing] = useState(false);
  const [feedbackDeletingIds, setFeedbackDeletingIds] = useState([]);
  const [feedbackDeleteError, setFeedbackDeleteError] = useState("");
  const [feedbackSelectedIds, setFeedbackSelectedIds] = useState([]);
  const [feedbackInboxSection, setFeedbackInboxSection] = useState("messages");
  const [analyticsPeriod, setAnalyticsPeriod] = useState(30);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");
  const [isSketchSubmissionOpen, setIsSketchSubmissionOpen] = useState(false);
  const [isSketchSubmissionClosing, setIsSketchSubmissionClosing] = useState(false);
  const [sketchSubmissionMapIds, setSketchSubmissionMapIds] = useState([]);
  const [sketchSubmissionNote, setSketchSubmissionNote] = useState("");
  const [sketchSubmissionStatus, setSketchSubmissionStatus] = useState("");
  const [submissionEditContext, setSubmissionEditContext] = useState(null);
  const [submissionEditStatus, setSubmissionEditStatus] = useState("");
  const [publicLibraryEditContext, setPublicLibraryEditContext] = useState(null);
  const [publicLibraryEditStatus, setPublicLibraryEditStatus] = useState("");
  const [isAccountSwitcherOpen, setIsAccountSwitcherOpen] = useState(false);
  const [savedAccountDragId, setSavedAccountDragId] = useState(null);
  const [savedAccountDropId, setSavedAccountDropId] = useState(null);
  const [savedAccountDragVisual, setSavedAccountDragVisual] = useState(null);
  const [switchingAccountId, setSwitchingAccountId] = useState(null);
  const [accountToRemove, setAccountToRemove] = useState(null);
  const [isAccountRemoveClosing, setIsAccountRemoveClosing] = useState(false);
  const [removingSavedAccountId, setRemovingSavedAccountId] = useState(null);
  const [savedAccounts, setSavedAccounts] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(SAVED_ACCOUNTS_KEY) || "[]");
    } catch {
      return [];
    }
  });
  const [downloadChoice, setDownloadChoice] = useState(null);

  const [selectionTool, setSelectionTool] = useState(false);
  const [selection, setSelection] = useState(null);
  const [selectionReady, setSelectionReady] = useState(false);
  const selectionGestureRef = useRef(null);
  const panGestureRef = useRef(null);
  const [strokeCounter, setStrokeCounter] = useState(null);
  const strokeCountRef = useRef(0);
  const strokeButtonRef = useRef(1);
  const canvasRef = useRef(null);
  const viewportRef = useRef(null);
  const accountRef = useRef(null);
  const languageRef = useRef(null);
  const accountHoverCloseRef = useRef(null);
  const accountCloseAnimationRef = useRef(null);
  const accountNameEditorRef = useRef(null);
  const accountNameInputRef = useRef(null);
  const accountNameCloseTimerRef = useRef(null);
  const feedbackFileInputRef = useRef(null);
  const feedbackModalRef = useRef(null);
  const feedbackModalHeightRef = useRef(null);
  const feedbackModalAnimationRef = useRef(null);
  const feedbackThanksAutoTimerRef = useRef(null);
  const feedbackThanksCloseTimerRef = useRef(null);
  const savedAccountPositionsRef = useRef(new Map());
  const savedAccountPointerRef = useRef(null);
  const suppressSavedAccountClickRef = useRef(false);
  const demoPointerRef = useRef(null);
  const demoModeRef = useRef("draw");
  const heroNotePointerRef = useRef(null);
  const heroNoteModeRef = useRef("draw");
  const suppressContextMenuRef = useRef(false);
  const suppressHeroContextMenuRef = useRef(false);
  const wasGameCompleteRef = useRef(false);
  const gameVictoryBaselineMapRef = useRef(null);
  const wasDemoCompleteRef = useRef(false);
  const imageProcessingRef = useRef(0);
  const sourceImageRef = useRef(null);
  const cellAnimationsRef = useRef(new Map());
  const cellAnimationTimerRef = useRef(null);
  const canvasAnimationFrameRef = useRef(null);
  const drawCanvasRef = useRef(null);
  const analyticsSessionTrackedRef = useRef(false);

  const isDrawingRef = useRef(false);
  const drawModeRef = useRef("draw");
  const previousCellRef = useRef(null);
  const activePointerIdRef = useRef(null);

  const completedRef = useRef(new Set());
  const progressCompletedRef = useRef(new Set());
  const progressExtraRef = useRef(0);
  const colorsRef = useRef([]);
  const drawColorRef = useRef(drawColor);
  const activityLogRef = useRef([]);

  const strokeBeforeRef = useRef(null);
  const strokeColorsBeforeRef = useRef([]);
  const strokeVisitedRef = useRef(new Set());

  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const pendingVersionSequenceRef = useRef([]);
  const gridRestoreRef = useRef(null);

  const hydratingRef = useRef(true);
  const saveTimerRef = useRef(null);
  const remoteSaveQueueRef = useRef(Promise.resolve());
  const activeMapRef = useRef(activeMap);
  const hydrationReleaseTimerRef = useRef(null);
  const historyReadyRef = useRef(false);
  const historyNavigationRef = useRef(false);
  const historyCloseTimerRef = useRef(null);
  const versionUndoTimerRef = useRef(null);
  const versionUndoCloseTimerRef = useRef(null);
  const historyPlaybackFrameRef = useRef(null);
  const historyPlaybackPositionRef = useRef(0);
  const historyPlaybackLastFrameRef = useRef(0);
  const historyPlaybackSpeedRef = useRef(1);
  const historyTimelineFillRef = useRef(null);
  const deletedVersionsRef = useRef([]);
  const preservedScrollRef = useRef(null);
  const mapCellsHoldRef = useRef({ delay: null, interval: null });
  const gameFillTimersRef = useRef([]);
  const gameFillAnimationRef = useRef(null);

  const requestedTotal = Math.max(
    1,
    Number(totalCells) || 1
  );

  const {
    rows,
    cols,
    actualTotal,
  } = getGridDimensions(
    requestedTotal,
    imageRatio,
    gridMode,
    manualRows,
    manualCols
  );

  const currentStats = getMapStats({ mapType, totalCells, imageRatio, gridMode, manualRows, manualCols, completed, progressCompleted });
  const drawingSet = new Set(completed);
  const progressSet = new Set(progressCompleted);
  const displayedCompleted = progressCompleted.filter((i) => i < actualTotal && (mapType === "image" || drawingSet.has(i)));
  const displayedTotal = currentStats.total;
  const displayedProgress = currentStats.percent;
  const dailyPlan = activeMap ? adaptiveDailyTarget({ ...activeMap, totalCells, imageRatio, gridMode, manualRows, manualCols, completed, progressCompleted }, todayDate) : null;
  const newMapCount = newMapGridMode === "manual" ? Number(newMapRows) * Number(newMapCols) : Number(newMapCells);
  const newMapInvalid = !Number.isInteger(newMapCount) || newMapCount < 1 || newMapCount > MAX_CELLS
    || (newMapGridMode === "manual" && (!Number.isInteger(Number(newMapRows)) || !Number.isInteger(Number(newMapCols)) || Number(newMapRows) < 1 || Number(newMapCols) < 1));
  const fitScale = Math.min((viewportSize.width - 24) / cols, (viewportSize.height - 24) / rows);
  const displayDpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const renderedCellScale = Math.max(1 / displayDpr, Math.floor(fitScale * mapZoom * displayDpr) / displayDpr);
  const canvasWidth = Math.max(1, cols * renderedCellScale);
  const canvasHeight = Math.max(1, rows * renderedCellScale);

  const t = (key) =>
    additionalTranslations[language]?.[key] ??
    translations[language]?.[key] ??
    translations.ru[key] ??
    key;

  function rememberScrollPosition(screenName) {
    const position = Math.max(window.scrollY, document.documentElement.scrollTop, document.body.scrollTop);
    const positions = JSON.parse(localStorage.getItem(SCROLL_POSITIONS_KEY) || "{}");
    positions[screenName] = position;
    localStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify(positions));
    preservedScrollRef.current = { screen: screenName, position };
  }

  function openMapFromList(map) {
    rememberScrollPosition("maps");
    openMap(map);
    setScreen("editor");
  }

  function toggleDemoCell(setCells, index, erase = false) {
    setCells((previous) => {
      const next = new Set(previous);
      if (erase) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const accountName =
    user?.user_metadata?.username ||
    user?.user_metadata?.user_name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    "majurx64";

  const accountEmail = user?.email || "";
  const isLibraryOwner = accountEmail.toLowerCase() === PUBLIC_LIBRARY_OWNER_EMAIL;
  const recordAnalytics = (eventName, options = {}) => {
    if (!isLibraryOwner) trackAnalytics(eventName, { ...options, userId: user?.id || null });
  };

  const accountInitial =
    accountName.trim().charAt(0).toUpperCase() || "M";
  const headerAccountName = accountName.length > 10 ? `${accountName.slice(0, 10)}…` : accountName;
  const accountTriggerCharacters = Math.max(6, headerAccountName.length);
  const otherSavedAccounts = savedAccounts.filter((account) => account.id !== user?.id);
  const unreadFeedbackCount = feedbackMessages.filter((message) => !message.is_read).length;
  const sectionFeedbackMessages = feedbackMessages.filter((message) =>
    feedbackInboxSection === "sketches" ? message.kind === "Эскиз в общую библиотеку" : message.kind !== "Эскиз в общую библиотеку"
  );
  const feedbackFilters = [
    ["all", "Все"],
    ["new", "Не обработано"],
    ["in_progress", "В работе"],
    ["done", "Готово"],
  ].map(([key, title]) => ({
    key,
    title,
    count: key === "all" ? sectionFeedbackMessages.length : sectionFeedbackMessages.filter((message) => (message.work_status || "new") === key).length,
  }));
  const visibleFeedbackMessages = feedbackInboxFilter === "all"
    ? sectionFeedbackMessages
    : sectionFeedbackMessages.filter((message) => (message.work_status || "new") === feedbackInboxFilter);

  const accountMapStats = maps.map((map) => {
    const statsSource = map.id === activeMapId
      ? { ...map, mapType, totalCells, imageRatio, gridMode, manualRows, manualCols, completed, progressCompleted }
      : map;
    return { ...map, ...getMapStats(statsSource) };
  });

  const accountPaintedCells = accountMapStats.reduce(
    (sum, map) => sum + Math.min(map.filled, map.total),
    0
  );
  const accountTotalCells = accountMapStats.reduce(
    (sum, map) => sum + map.total,
    0
  );
  const accountFinishedMaps = accountMapStats.filter(
    (map) => map.total > 0 && map.filled >= map.total
  ).length;
  const accountRemainingCells = Math.max(0, accountTotalCells - accountPaintedCells);
  const accountProgressPercent = accountTotalCells
    ? Math.min(100, Math.round((accountPaintedCells / accountTotalCells) * 1000) / 10)
    : 0;
  const accountDailyGoal = accountRemainingCells
    ? Math.ceil(accountRemainingCells / 30)
    : 0;
  const accountHistory = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - offset));
    const key = getActivityDate(date);
    const cells = maps.reduce((sum, map) => sum + (map.activityLog || [])
      .filter((entry) => entry.date === key)
      .reduce((subtotal, entry) => subtotal + entry.cells, 0), 0);
    return { key, cells, label: `${date.getDate()}.${String(date.getMonth() + 1).padStart(2, "0")}` };
  });
  const accountHistoryMax = Math.max(1, ...accountHistory.map((item) => item.cells));
  const accountAchievements = [
    { icon: "✦", title: "Первый контур", text: "Создать 1 карту", current: maps.length, goal: 1 },
    { icon: "◈", title: "Коллекция", text: "Создать 3 карты", current: maps.length, goal: 3 },
    { icon: "▦", title: "Картограф", text: "Создать 5 карт", current: maps.length, goal: 5 },
    { icon: "◇", title: "Архивариус", text: "Создать 10 карт", current: maps.length, goal: 10 },
    { icon: "●", title: "Первый шаг", text: "Закрасить 50 клеток", current: accountPaintedCells, goal: 50 },
    { icon: "◆", title: "Ритм", text: "Закрасить 200 клеток", current: accountPaintedCells, goal: 200 },
    { icon: "✺", title: "Большая картина", text: "Закрасить 500 клеток", current: accountPaintedCells, goal: 500 },
    { icon: "✹", title: "Тысяча шагов", text: "Закрасить 1 000 клеток", current: accountPaintedCells, goal: 1000 },
    { icon: "◉", title: "Масштаб", text: "Закрасить 2 000 клеток", current: accountPaintedCells, goal: 2000 },
    { icon: "✦", title: "Своя вселенная", text: "Закрасить 5 000 клеток", current: accountPaintedCells, goal: 5000 },
    { icon: "✧", title: "Дальний путь", text: "Закрасить 10 000 клеток", current: accountPaintedCells, goal: 10000 },
    { icon: "☽", title: "Три дня в ритме", text: "Отмечать прогресс 3 дня за неделю", current: accountHistory.filter((item) => item.cells > 0).length, goal: 3 },
    { icon: "☼", title: "Ритм недели", text: "Отмечать прогресс каждый день в течение 7 дней", current: accountHistory.filter((item) => item.cells > 0).length, goal: 7 },
    { icon: "♟", title: "Первый финиш", text: "Полностью завершить 1 карту", current: accountFinishedMaps, goal: 1 },
    { icon: "♜", title: "Финиш", text: "Завершить 3 карты", current: accountFinishedMaps, goal: 3 },
    { icon: "♛", title: "Серия побед", text: "Завершить 5 карт", current: accountFinishedMaps, goal: 5 },
  ];
  const libraryUserKey = user?.id || "guest";
  const personalLibrary = useMemo(() => Array.isArray(privateLibrary[libraryUserKey]) ? privateLibrary[libraryUserKey] : [], [privateLibrary, libraryUserKey]);
  const libraryFavorites = Array.isArray(favoritesByUser[libraryUserKey]) ? favoritesByUser[libraryUserKey] : [];
  function setLibraryFavorites(update) {
    setFavoritesByUser((current) => ({ ...current, [libraryUserKey]: update(Array.isArray(current[libraryUserKey]) ? current[libraryUserKey] : []) }));
  }
  function toggleLibraryFavorite(itemId) {
    setLibraryFavorites((current) => current.includes(itemId)
      ? current.filter((id) => id !== itemId)
      : [...current, itemId]);
  }
  const libraryCategories = ["Все", ...new Set([
    ...publicLibrary.map((item) => item.category || "Другое"),
    ...customCategories,
  ])];
  const publicLibraryCategoryOptions = [...new Set([
    "Спорт",
    "Личное",
    ...customCategories,
    ...publicLibrary.map((item) => item.category || "Другое"),
  ])];
  const visiblePublicLibrary = publicLibrary
    .filter((item) => libraryCategory === "Все" || item.category === libraryCategory)
    .filter((item) => !librarySearch.trim() || `${item.name} ${item.category || ""}`.toLowerCase().includes(librarySearch.trim().toLowerCase()))
    .sort((a, b) => {
      if (librarySort === "name") return a.name.localeCompare(b.name, "ru");
      if (librarySort === "new") return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
      if (librarySort === "favorites") {
        const favoriteOrder = Number(libraryFavorites.includes(b.id)) - Number(libraryFavorites.includes(a.id));
        return favoriteOrder || a.name.localeCompare(b.name, "ru");
      }
      return Math.max(Number(b.useCount) || 0, Number(libraryUsage[b.id]) || 0) - Math.max(Number(a.useCount) || 0, Number(libraryUsage[a.id]) || 0);
    });
  const visiblePublicLibraryOrder = visiblePublicLibrary.map((item) => item.id).join("|");
  const libraryCardPositionsRef = useRef(new Map());
  useLayoutEffect(() => {
    if (screen !== "library") return;
    const cards = [...document.querySelectorAll("[data-library-item-id]")];
    const nextPositions = new Map(cards.map((card) => [card.dataset.libraryItemId, card.getBoundingClientRect()]));
    cards.forEach((card) => {
      const previous = libraryCardPositionsRef.current.get(card.dataset.libraryItemId);
      const next = nextPositions.get(card.dataset.libraryItemId);
      if (!previous || !next) return;
      const deltaX = previous.left - next.left;
      const deltaY = previous.top - next.top;
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;
      card.animate(
        [{ transform: `translate(${deltaX}px, ${deltaY}px)`, opacity: .82 }, { transform: "translate(0, 0)", opacity: 1 }],
        { duration: 480, easing: "cubic-bezier(.16,1,.3,1)" },
      );
    });
    libraryCardPositionsRef.current = nextPositions;
  }, [screen, visiblePublicLibraryOrder]);
  const streaks = useMemo(() => calculateStreaks(maps, new Date(`${todayKey}T12:00:00`)), [maps, todayKey]);
  const historyMap = maps.find((map) => map.id === historyMapId) || null;
  const historyVersionEntries = useMemo(() => {
    const entries = (historyMap?.versions || []).map((version, index) => ({ version, index }));
    if (historyViewMode === "changes") return entries;
    const latestByDay = new Map();
    entries.forEach((entry) => latestByDay.set(getActivityDate(new Date(entry.version.createdAt)), entry));
    return [...latestByDay.values()];
  }, [historyMap?.versions, historyViewMode]);
  const historyPlaybackEntries = useMemo(() => {
    if (historyPreviewMode !== "cells") return historyVersionEntries;
    const gameStart = historyVersionEntries.findIndex(({ version }) => version.isGameMode);
    return gameStart >= 0 ? historyVersionEntries.slice(gameStart) : historyVersionEntries;
  }, [historyPreviewMode, historyVersionEntries]);

  useEffect(() => {
    let cancelled = false;
    const loadPublicLibrary = async () => {
      const { data, error } = await supabase
        .from(PUBLIC_LIBRARY_TABLE)
        .select("*")
        .order("created_at", { ascending: true });
      if (cancelled || error) return;
      const hiddenBuiltinIds = new Set((data || [])
        .flatMap((row) => [row.data?.hiddenBuiltinId, row.data?.replacesBuiltinId])
        .filter(Boolean));
      const savedItems = (data || [])
        .filter((row) => !row.data?.hiddenBuiltinId)
        .map((row) => ({
        ...normalizeMap({ ...row.data, id: row.id, name: row.name }),
        publicLibraryOwnerId: row.owner_id,
        replacesBuiltinId: row.data?.replacesBuiltinId || null,
        useCount: Number.isFinite(row.use_count) ? row.use_count : null,
        createdAt: row.created_at || row.data?.createdAt,
      }));
      setPublicLibrary([
        ...BUILTIN_PUBLIC_LIBRARY.filter((item) => !hiddenBuiltinIds.has(item.id)),
        ...savedItems,
      ]);
    };
    loadPublicLibrary();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PRIVATE_LIBRARY_KEY, JSON.stringify(privateLibrary));
    } catch (error) {
      console.warn("Не удалось сохранить личную библиотеку:", error);
    }
  }, [privateLibrary]);

  useEffect(() => {
    try { localStorage.setItem(LIBRARY_FAVORITES_KEY, JSON.stringify(favoritesByUser)); } catch { /* optional device preference */ }
  }, [favoritesByUser]);

  useEffect(() => {
    try { localStorage.setItem(LIBRARY_USAGE_KEY, JSON.stringify(libraryUsage)); } catch { /* optional device preference */ }
  }, [libraryUsage]);

  useEffect(() => {
    const handleInstall = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    window.addEventListener("beforeinstallprompt", handleInstall);
    let cancelled = false;
    const display = window.matchMedia("(display-mode: standalone)");
    const refreshAppState = () => {
      setAppStandalone(isStandaloneApp(window));
      void hasInstalledApp(navigator, window.location.origin).then((installed) => {
        if (!cancelled) setAppInstalled(installed);
      });
    };
    const installed = () => { setInstallPrompt(null); setAppInstalled(true); setAppHelpOpen(true); };
    refreshAppState();
    display.addEventListener("change", refreshAppState);
    window.addEventListener("appinstalled", installed);
    return () => {
      cancelled = true;
      window.removeEventListener("beforeinstallprompt", handleInstall);
      window.removeEventListener("appinstalled", installed);
      display.removeEventListener("change", refreshAppState);
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("shared");
    const snapshot = new URLSearchParams(window.location.hash.slice(1)).get("snapshot") || params.get("snapshot");
    if (!token && !snapshot) return;
    let cancelled = false;
    if (snapshot) {
      decodeSharedSnapshot(snapshot).then((data) => {
        if (cancelled) return;
        setSharedView({ ...data, map: normalizeMap(data.map) });
        setSharedViewStatus("ready");
        setScreen("shared");
      }).catch(() => {
        if (!cancelled) { setSharedViewStatus("missing"); setScreen("shared"); }
      });
      return () => { cancelled = true; };
    }
    supabase.rpc("get_shared_map", { share_token: token }).then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data) {
        setSharedViewStatus("missing");
        setScreen("shared");
        return;
      }
      setSharedView({ ...data, map: normalizeMap(data.map_data) });
      setSharedViewStatus("ready");
      setScreen("shared");
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!user?.id || mapsLoading || !isMapInitialized || maps.length || screen === "shared" || syncStatus || !navigator.onLine) return;
    const key = `${ONBOARDING_KEY}:${user.id}`;
    if (localStorage.getItem(key)) return;
    const timer = window.setTimeout(() => {
      setOnboardingStep(0);
      setOnboardingOpen(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [user?.id, mapsLoading, isMapInitialized, maps.length, screen, syncStatus]);

  useEffect(() => {
    if (!historyPlaying || historyPlaybackEntries.length < 2) return undefined;
    let visiblePosition = Math.min(
      historyPlaybackEntries.length - 1,
      Math.max(0, historyPlaybackPositionRef.current)
    );
    let renderedPosition = Math.ceil(visiblePosition - 0.0001);
    historyPlaybackLastFrameRef.current = 0;

    const renderFrame = (now) => {
      const previousFrame = historyPlaybackLastFrameRef.current || now;
      historyPlaybackLastFrameRef.current = now;
      visiblePosition = Math.min(
        historyPlaybackEntries.length - 1,
        visiblePosition + (now - previousFrame) / (850 / historyPlaybackSpeedRef.current)
      );
      historyPlaybackPositionRef.current = visiblePosition;

      if (historyTimelineFillRef.current) {
        historyTimelineFillRef.current.style.width = `${visiblePosition / (historyPlaybackEntries.length - 1) * 100}%`;
      }

      const nextRenderedPosition = Math.min(
        historyPlaybackEntries.length - 1,
        Math.ceil(visiblePosition - 0.0001)
      );
      if (nextRenderedPosition !== renderedPosition) {
        renderedPosition = nextRenderedPosition;
        setHistoryPreviewIndex(historyPlaybackEntries[renderedPosition].index);
      }

      if (visiblePosition >= historyPlaybackEntries.length - 1) {
        setHistoryPlaying(false);
        return;
      }
      historyPlaybackFrameRef.current = window.requestAnimationFrame(renderFrame);
    };

    historyPlaybackFrameRef.current = window.requestAnimationFrame(renderFrame);
    return () => {
      window.cancelAnimationFrame(historyPlaybackFrameRef.current);
      historyPlaybackFrameRef.current = null;
      historyPlaybackLastFrameRef.current = 0;
      if (historyTimelineFillRef.current) historyTimelineFillRef.current.style.width = "";
    };
  }, [historyPlaying, historyMapId, historyPlaybackEntries]);

  useEffect(() => {
    if (!historyMapId) return undefined;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const previousRootOverflow = document.documentElement.style.overflow;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      document.documentElement.style.overflow = previousRootOverflow;
    };
  }, [historyMapId]);

  async function saveMapToLibrary(map) {
    const dimensions = getGridDimensions(map.totalCells, map.imageRatio, map.gridMode, map.manualRows, map.manualCols);
    const item = normalizeMap({
      ...map,
      id: createMapId(),
      mapType: "free",
      image: null,
      showImage: false,
      completed: map.mapType === "image"
        ? Array.from({ length: dimensions.actualTotal }, (_, index) => index)
        : map.completed,
      progressCompleted: [],
      progressExtra: 0,
      modeDrafts: {},
      privateLibraryItem: true,
    });
    if (user) {
      const { error } = await supabase.from("maps").upsert(mapToSupabaseRow(item, user.id), { onConflict: "id" });
      if (error) {
        setLibraryStatus("Не удалось сохранить эскиз в аккаунте.");
        return;
      }
    }
    setPrivateLibrary((current) => ({
      ...current,
      [libraryUserKey]: [...(current[libraryUserKey] || []), item],
    }));
  }

  async function saveMapToPublicLibrary(map) {
    if (!user || !isLibraryOwner) return;
    setLibraryStatus("Сохраняем рисунок…");
    const dimensions = getGridDimensions(map.totalCells, map.imageRatio, map.gridMode, map.manualRows, map.manualCols);
    const item = normalizeMap({
      ...map,
      id: `public-${createMapId()}`,
      mapType: "free",
      image: null,
      showImage: false,
      completed: map.mapType === "image"
        ? Array.from({ length: dimensions.actualTotal }, (_, index) => index)
        : map.completed,
      progressCompleted: [],
      progressExtra: 0,
      modeDrafts: {},
    });
    const { error } = await supabase.from(PUBLIC_LIBRARY_TABLE).insert({
      id: item.id,
      owner_id: user.id,
      name: item.name,
      data: item,
    });
    if (error) {
      setLibraryStatus("Не удалось добавить рисунок в публичную коллекцию.");
      return;
    }
    setPublicLibrary((current) => [...current, { ...item, publicLibraryOwnerId: user.id }]);
    setLibraryStatus("Рисунок добавлен в публичную коллекцию.");
  }

  async function removePublicLibraryItem(item) {
    if (!user || !isLibraryOwner) return;
    const { error } = item.publicLibraryOwnerId
      ? item.replacesBuiltinId
        ? await supabase
          .from(PUBLIC_LIBRARY_TABLE)
          .update({ data: { hiddenBuiltinId: item.replacesBuiltinId } })
          .eq("id", item.id)
          .eq("owner_id", user.id)
        : await supabase
          .from(PUBLIC_LIBRARY_TABLE)
          .delete()
          .eq("id", item.id)
          .eq("owner_id", user.id)
      : await supabase.from(PUBLIC_LIBRARY_TABLE).insert({
          id: `hidden-${item.id}`,
          owner_id: user.id,
          name: item.name,
          data: { hiddenBuiltinId: item.id },
        });
    if (error) {
      setLibraryStatus("Не удалось удалить рисунок из публичной коллекции.");
      return;
    }
    setPublicLibrary((current) => current.filter((entry) => entry.id !== item.id));
    setLibraryStatus("Рисунок удалён из публичной коллекции.");
  }

  async function saveAccountName() {
    const nextName = accountNameDraft.trim().slice(0, 20);
    if (!user || nextName.length < 2) {
      setAccountNameStatus("Введите ник длиной от 2 до 20 символов.");
      return;
    }
    setAccountNameStatus("Сохраняем…");
    const { data, error } = await supabase.auth.updateUser({ data: { username: nextName } });
    if (error || !data.user) {
      setAccountNameStatus("Не удалось изменить ник.");
      return;
    }
    setUser(data.user);
    setAccountNameStatus("");
    closeAccountNameEditor();
  }

  function openAccountNameEditor() {
    window.clearTimeout(accountNameCloseTimerRef.current);
    setAccountNameDraft(accountName);
    setAccountNameStatus("");
    setIsClosingAccountName(false);
    setIsEditingAccountName(true);
  }

  function closeAccountNameEditor() {
    if (!isEditingAccountName || isClosingAccountName) return;
    setIsClosingAccountName(true);
    window.clearTimeout(accountNameCloseTimerRef.current);
    accountNameCloseTimerRef.current = window.setTimeout(() => {
      setIsEditingAccountName(false);
      setIsClosingAccountName(false);
    }, 180);
  }

  async function removeLibraryItem(id) {
    if (user) {
      const { error } = await supabase.from("maps").delete().eq("id", id).eq("user_id", user.id);
      if (error) {
        setLibraryStatus("Не удалось удалить эскиз из аккаунта.");
        return;
      }
    }
    setPrivateLibrary((current) => ({
      ...current,
      [libraryUserKey]: (current[libraryUserKey] || []).filter((item) => item.id !== id),
    }));
  }

  async function createMapFromLibrary(item) {
    const map = normalizeMap({
      ...item,
      id: createMapId(),
      createdAt: new Date().toISOString(),
      completedAt: "",
      versions: [],
      shareId: "",
      privateLibraryItem: false,
      order: maps.length,
      name: item.name,
      progressCompleted: [],
      progressExtra: 0,
      activityLog: [],
      dailyPlanDoneOn: "",
      modeDrafts: {},
    });
    if (user) {
      const { error } = await supabase.from("maps").upsert(mapToSupabaseRow(map, user.id), { onConflict: "id" });
      if (error) {
        setMapActionError("Не удалось добавить рисунок из библиотеки.");
        return;
      }
    }
    const next = [...maps, map];
    setMaps(next);
    saveMapsLocally(next);
    recordAnalytics("map_created", { metadata: { source: "library" } });
    recordAnalytics("cells_created", { value: Number(map.totalCells) || 0, metadata: { source: "library" } });
    setLibraryUsage((current) => ({ ...current, [item.id]: (Number(current[item.id]) || 0) + 1 }));
    if (item.publicLibraryOwnerId) {
      setPublicLibrary((current) => current.map((entry) => entry.id === item.id
        ? { ...entry, useCount: (Number(entry.useCount) || 0) + 1 }
        : entry));
      void supabase.rpc("increment_library_item_use", { item_id: item.id });
    }
    setActiveMapId(map.id);
    openMap(map);
    setScreen("editor");
  }

  function editPublicLibraryItem(item) {
    if (!user || !isLibraryOwner) return;
    const draft = normalizeMap({ ...item, id: createMapId(), progressCompleted: [] });
    setPublicLibraryDraft(draft);
    setPublicLibraryCategoryDraft(item.category || "Личное");
    setPublicLibraryEditContext({
      draftId: draft.id,
      itemId: item.id,
      replacesBuiltinId: item.publicLibraryOwnerId ? item.replacesBuiltinId : item.id,
      originScrollY: Math.max(window.scrollY, document.documentElement.scrollTop, document.body.scrollTop),
    });
    setPublicLibraryEditStatus("");
    setActiveMapId(draft.id);
    openMap(draft);
    setScreen("editor");
    localStorage.setItem(ACTIVE_MAP_KEY, draft.id);
  }

  async function finishPublicLibraryEditing(saveChanges) {
    if (!publicLibraryEditContext) return;
    const context = publicLibraryEditContext;
    if (saveChanges) {
      const currentMap = buildCurrentMap();
      if (!currentMap) return;
      setPublicLibraryEditStatus("saving");
      const item = normalizeMap({
        ...currentMap,
        category: publicLibraryCategoryDraft,
        id: context.itemId,
        mapType: "free",
        image: null,
        showImage: false,
        progressCompleted: [],
        progressExtra: 0,
        activityLog: [],
        modeDrafts: {},
      });
      const storedItem = context.replacesBuiltinId
        ? { ...item, replacesBuiltinId: context.replacesBuiltinId }
        : item;
      const request = context.replacesBuiltinId && context.itemId === context.replacesBuiltinId
        ? supabase.from(PUBLIC_LIBRARY_TABLE).insert({
            id: item.id,
            owner_id: user.id,
            name: item.name,
            data: storedItem,
          })
        : supabase.from(PUBLIC_LIBRARY_TABLE)
            .update({ name: item.name, data: storedItem })
            .eq("id", context.itemId)
            .eq("owner_id", user.id);
      const { error } = await request;
      if (error) {
        setPublicLibraryEditStatus("error");
        return;
      }
      setPublicLibrary((current) => current.map((entry) => entry.id === context.itemId
        ? { ...storedItem, publicLibraryOwnerId: user.id }
        : entry));
    }
    setPublicLibraryDraft(null);
    setPublicLibraryCategoryDraft("Личное");
    setActiveMapId(null);
    setPublicLibraryEditContext(null);
    setPublicLibraryEditStatus("");
    const positions = JSON.parse(localStorage.getItem(SCROLL_POSITIONS_KEY) || "{}");
    positions.library = context.originScrollY || 0;
    localStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify(positions));
    preservedScrollRef.current = { screen: "library", position: context.originScrollY || 0 };
    setScreen("library");
    localStorage.removeItem(ACTIVE_MAP_KEY);
  }

  useEffect(() => {
    if (screen !== "account") return;

    const unlocked = accountAchievements
      .filter((item) => item.current >= item.goal)
      .map((item) => item.title);
    const newCelebrations = unlocked.filter((title) => !celebratingAchievements.has(title));

    if (!newCelebrations.length) return;

    setNewAchievementAnimations((previous) => [
      ...new Set([...previous, ...newCelebrations]),
    ]);

    setCelebratingAchievements((previous) => {
      const next = new Set([...previous, ...newCelebrations]);
      sessionStorage.setItem(ACHIEVEMENT_SESSION_KEY, JSON.stringify([...next]));
      return next;
    });
  }, [screen, accountPaintedCells, maps.length]);

  useEffect(() => {
    localStorage.setItem(LANGUAGE_KEY, language);
  }, [language]);

  useEffect(() => {
    if (!user?.id) {
      setMapColumns(2);
      return;
    }
    const saved = Number(localStorage.getItem(`${MAPS_COLUMNS_KEY}:${user.id}`));
    setMapColumns([1, 2, 3, 4].includes(saved) ? saved : 2);
  }, [user?.id]);

  useEffect(() => {
    let timer;
    const scheduleNextDay = () => {
      const now = new Date();
      const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = window.setTimeout(() => {
        setTodayKey(getActivityDate());
        scheduleNextDay();
      }, nextDay.getTime() - now.getTime() + 100);
    };
    scheduleNextDay();
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => () => stopMapCellsHold(), []);
  useEffect(() => () => {
    gameFillTimersRef.current.forEach(window.clearTimeout);
    window.cancelAnimationFrame(gameFillAnimationRef.current);
  }, []);

  useEffect(() => {
    if (!historyReadyRef.current) {
      window.history.replaceState({ mapMethod: true, screen, activeMapId }, "", window.location.href);
      historyReadyRef.current = true;
      return;
    }
    if (historyNavigationRef.current) {
      historyNavigationRef.current = false;
      return;
    }
    window.history.pushState({ mapMethod: true, screen, activeMapId }, "", window.location.href);
  }, [screen]);

  useEffect(() => {
    const handlePopState = (event) => {
      const availableScreens = ["home", "maps", "editor", "account", "library", "feedback-inbox", "analytics", "shared", "auth"];
      const previousScreen = event.state?.mapMethod && availableScreens.includes(event.state.screen)
        ? event.state.screen
        : "home";
      historyNavigationRef.current = true;
      setScreen((current) => {
        if (current === previousScreen) historyNavigationRef.current = false;
        return previousScreen;
      });
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    localStorage.setItem(
      CUSTOM_COLORS_KEY,
      JSON.stringify(customColors)
    );
  }, [customColors]);

  useEffect(() => {
    localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(customCategories));
  }, [customCategories]);

  useEffect(() => {
    localStorage.setItem(CATEGORY_ORDER_KEY, JSON.stringify(allCategories));
  }, [categoryOrder, customCategories]);

  useLayoutEffect(() => {
    if (!cardSettling || !cardPositionsRef.current) return;
    cardAnimationsRef.current.forEach((animation) => animation.cancel());
    const previousPositions = cardPositionsRef.current;
    cardPositionsRef.current = null;
    const animations = [...document.querySelectorAll("[data-map-id]")].flatMap((element) => {
      const previous = previousPositions.get(element.dataset.mapId);
      if (!previous) return [];
      const destination = element.getBoundingClientRect();
      const deltaX = previous.left - destination.left;
      const deltaY = previous.top - destination.top;
      const resize = cardSettling.type === "layout";
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return [];
      return [element.animate([
        { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)` },
        { transform: "translate3d(0, 0, 0)" },
      ], { duration: resize ? 520 : 420, easing: "cubic-bezier(.16,1,.3,1)" })];
    });
    if (!animations.length) {
      setCardSettling(null);
      return;
    }
    cardAnimationsRef.current = animations;
    Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
      if (cardAnimationsRef.current !== animations) return;
      cardAnimationsRef.current = [];
      setCardSettling(null);
    });
    return () => {
      animations.forEach((animation) => animation.cancel());
      if (cardAnimationsRef.current === animations) cardAnimationsRef.current = [];
    };
  }, [maps, cardSettling]);

  useEffect(() => {
    localStorage.setItem(
      CURRENT_SCREEN_KEY,
      screen
    );

    if (
      isMapInitialized &&
      screen === "editor" &&
      !activeMapId
    ) {
      setScreen("maps");
    }
  }, [screen, activeMapId, isMapInitialized]);

  useEffect(() => {
    if (authLoading || mapsLoading) return;

    // Главная всегда управляется только пользователем и якорными кнопками.
    // Восстановление старой позиции здесь могло сорвать плавную прокрутку.
    if (screen === "home") return;

    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }

    const positions = JSON.parse(
      localStorage.getItem(SCROLL_POSITIONS_KEY) || "{}"
    );
    const target = Math.max(0, Number(positions[screen]) || 0);
    let restored = false;
    const restore = () => {
      window.scrollTo(0, target);
      restored = true;
      if (preservedScrollRef.current?.screen === screen) preservedScrollRef.current = null;
    };
    // Восстанавливаем позицию только один раз. Повторные таймеры перехватывали
    // ручную прокрутку и иногда возвращали страницу наверх.
    const restoreTimers = [window.setTimeout(restore, 0)];
    const savePosition = () => {
      if (!restored) return;
      const next = JSON.parse(
        localStorage.getItem(SCROLL_POSITIONS_KEY) || "{}"
      );
      next[screen] = preservedScrollRef.current?.screen === screen
        ? preservedScrollRef.current.position
        : Math.max(window.scrollY, document.documentElement.scrollTop, document.body.scrollTop);
      localStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify(next));
    };
    window.addEventListener("scroll", savePosition, { passive: true });
    window.addEventListener("pagehide", savePosition);
    window.addEventListener("beforeunload", savePosition);
    const saveWhenHidden = () => {
      if (document.visibilityState === "hidden") savePosition();
    };
    document.addEventListener("visibilitychange", saveWhenHidden);
    return () => {
      restoreTimers.forEach((timer) => window.clearTimeout(timer));
      savePosition();
      window.removeEventListener("scroll", savePosition);
      window.removeEventListener("pagehide", savePosition);
      window.removeEventListener("beforeunload", savePosition);
      document.removeEventListener("visibilitychange", saveWhenHidden);
    };
  }, [screen, authLoading, mapsLoading]);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key !== "Escape") return;
      if (historyMapId) { closeHistoryModal(); return; }
      if (shareMap) { setShareMap(null); return; }
      if (showVictory) return;
      if (onboardingOpen) { finishOnboarding(); return; }

      if (downloadChoice) {
        closeModal("download");
        return;
      }
      if (accountToRemove) {
        closeAccountRemoveModal();
        return;
      }
      if (feedbackDeleteTargets.length) {
        closeFeedbackDeleteModal();
        return;
      }
      if (isFeedbackOpen) {
        closeModal("feedback");
        return;
      }

      if (isCreateOpen) {
        closeModal("create");
        return;
      }

      if (isRenameOpen) {
        closeModal("rename");
        return;
      }

      if (isDeleteOpen) {
        closeModal("delete");
        return;
      }

      if (isAccountOpen) {
        closeAccountMenu();
        return;
      }
      if (isLanguageOpen) {
        setIsLanguageOpen(false);
        return;
      }

      if (screen === "editor" && (selection || selectionTool)) {
        handlePointerCancel();
        setSelection(null);
        setSelectionTool(false);
        return;
      }
      if (screen === "editor" && publicLibraryEditContext) {
        void finishPublicLibraryEditing(false);
        return;
      }
      if (screen === "editor") {
        setScreen("maps");
      } else if (["maps", "account", "library", "auth"].includes(screen)) {
        setScreen("home");
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  });

  useEffect(() => {
    const handleDeletedVersionUndo = (event) => {
      if (!historyMapId || !(event.ctrlKey || event.metaKey) || event.shiftKey || event.code !== "KeyZ" || !deletedVersionsRef.current.length) return;
      const targetIsField = event.target instanceof HTMLInputElement
        || event.target instanceof HTMLTextAreaElement
        || event.target instanceof HTMLSelectElement
        || event.target?.isContentEditable;
      if (targetIsField) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void undoDeletedVersion();
    };
    window.addEventListener("keydown", handleDeletedVersionUndo, true);
    return () => window.removeEventListener("keydown", handleDeletedVersionUndo, true);
  });

  useEffect(() => {
    const handleDeletedMapUndo = (event) => {
      if (screen !== "maps" || !(event.ctrlKey || event.metaKey) || event.shiftKey || event.code !== "KeyZ") return;
      const targetIsField = event.target instanceof HTMLInputElement
        || event.target instanceof HTMLTextAreaElement
        || event.target instanceof HTMLSelectElement
        || event.target?.isContentEditable;
      if (targetIsField || (!pendingDeletesRef.current.length && !deletedMapsRef.current.length)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void restoreLastDeletedMap();
    };
    window.addEventListener("keydown", handleDeletedMapUndo, true);
    return () => window.removeEventListener("keydown", handleDeletedMapUndo, true);
  });

  useEffect(() => {
    if (!isMapInitialized) return;

    saveMapsLocally(maps);
    if (user?.id && loadedOwnerRef.current === user.id) {
      void cacheAccountMaps(user.id, [...maps, ...personalLibrary]).catch(() => setSyncStatus("Не удалось сохранить офлайн-копию: проверь свободное место на устройстве."));
    }
  }, [maps, isMapInitialized, user?.id, personalLibrary]);

  useEffect(() => {
    if (!pendingDeletes.length && !versionUndoNotice) return;
    const timer = window.setInterval(() => setDeleteCountdownNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [pendingDeletes.length, versionUndoNotice]);

  useEffect(() => {
    drawColorRef.current = drawColor;
  }, [drawColor]);

  useEffect(() => {
    activeMapRef.current = activeMap;
  }, [activeMap]);

  useEffect(() => {
    completedRef.current = new Set(completed);
  }, [completed]);

  useEffect(() => {
    progressCompletedRef.current = new Set(progressCompleted);
  }, [progressCompleted]);

  useEffect(() => {
    progressExtraRef.current = progressExtra;
  }, [progressExtra]);

  useEffect(() => {
    const preventContextMenuWhileDrawing = (event) => {
      if (
        !isDrawingRef.current &&
        !suppressContextMenuRef.current &&
        !suppressHeroContextMenuRef.current
      ) return;
      event.preventDefault();
      suppressContextMenuRef.current = false;
      suppressHeroContextMenuRef.current = false;
    };
    window.addEventListener("contextmenu", preventContextMenuWhileDrawing);
    return () => window.removeEventListener("contextmenu", preventContextMenuWhileDrawing);
  }, []);

  useEffect(() => {
    activityLogRef.current = activityLog;
  }, [activityLog]);

  useEffect(() => {
    if (!isMapInitialized || mapsLoading) return;
    const gameTotal = mapType === "image" ? actualTotal : completed.length;
    const complete = isGameMode && gameTotal > 0 && progressCompleted.length >= gameTotal;
    // Открытие или восстановление уже готовой карты — не повод запускать
    // поздравление. Оно появляется только после нового завершения в игре.
    if (gameVictoryBaselineMapRef.current === activeMapId) {
      wasGameCompleteRef.current = complete;
      gameVictoryBaselineMapRef.current = null;
      return;
    }
    if (complete && !wasGameCompleteRef.current) {
      setVictoryDismissing(false);
      setShowVictory(true);
    }
    wasGameCompleteRef.current = complete;
  }, [isGameMode, mapType, actualTotal, completed, progressCompleted, activeMapId, isMapInitialized, mapsLoading, activeMap?.completedAt, user?.id]);

  useEffect(() => {
    const complete = heroDemoCells.size === DEMO_PYRAMID_TOTAL;
    if (complete && !wasDemoCompleteRef.current) {
      setShowDemoVictory(true);
      const timer = window.setTimeout(() => setShowDemoVictory(false), 3600);
      wasDemoCompleteRef.current = true;
      return () => window.clearTimeout(timer);
    }
    if (!complete) wasDemoCompleteRef.current = false;
  }, [heroDemoCells]);

  useEffect(() => {
    colorsRef.current = colors;
  }, [colors]);

  useEffect(() => {
    let mounted = true;

    const rememberSession = (session) => {
      if (!session?.user || !session.refresh_token || !session.access_token) return;
      setSavedAccounts((previous) => {
        const account = {
            id: session.user.id,
            email: session.user.email || "",
            name: session.user.user_metadata?.username || session.user.email?.split("@")[0] || "Аккаунт",
            accessToken: session.access_token,
            refreshToken: session.refresh_token,
          };
        const existingIndex = previous.findIndex((saved) => saved.id === account.id);
        const next = existingIndex < 0
          ? [...previous, account]
          : previous.map((saved, index) => index === existingIndex ? account : saved);
        localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(next));
        return next;
      });
    };

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setUser((previous) => previous?.id === data.session?.user?.id ? previous : data.session?.user || null);
        rememberSession(data.session);
        setAuthLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (mounted) {
          setUser((previous) => previous?.id === session?.user?.id ? previous : session?.user || null);
          rememberSession(session);
          if (session?.user && ["SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED"].includes(event)) {
            const url = new URL(window.location.href);
            if (url.searchParams.has("code") || url.hash.includes("access_token")) {
              window.history.replaceState(window.history.state, "", `${url.origin}${url.pathname}`);
            }
            setScreen((current) => current === "auth" ? "account" : current);
          }
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useLayoutEffect(() => {
    if (!savedAccountDragId) return;
    document.querySelectorAll("[data-saved-account-id]").forEach((element) => {
      const previousTop = savedAccountPositionsRef.current.get(element.dataset.savedAccountId);
      if (previousTop == null) return;
      const currentTop = element.getBoundingClientRect().top;
      const delta = previousTop - currentTop;
      if (Math.abs(delta) > 1) {
        element.getAnimations().forEach((animation) => animation.cancel());
        element.animate(
          [{ transform: `translateY(${delta}px)` }, { transform: "translateY(0)" }],
          { duration: 200, easing: "cubic-bezier(.16,1,.3,1)" }
        );
      }
    });
  }, [savedAccounts, savedAccountDragId]);

  useLayoutEffect(() => {
    if (!isFeedbackOpen || !feedbackModalRef.current) {
      feedbackModalHeightRef.current = null;
      feedbackModalAnimationRef.current?.cancel();
      return;
    }
    const modal = feedbackModalRef.current;
    const nextHeight = modal.getBoundingClientRect().height;
    const previousHeight = feedbackModalHeightRef.current;
    feedbackModalHeightRef.current = nextHeight;
    if (!previousHeight || Math.abs(previousHeight - nextHeight) < 2) return;
    feedbackModalAnimationRef.current?.cancel();
    modal.style.overflow = "hidden";
    const animation = modal.animate(
      [{ height: `${previousHeight}px` }, { height: `${nextHeight}px` }],
      { duration: 440, easing: "cubic-bezier(.16,1,.3,1)" }
    );
    feedbackModalAnimationRef.current = animation;
    animation.onfinish = () => {
      modal.style.overflow = "";
      feedbackModalAnimationRef.current = null;
    };
  }, [feedbackFiles.length, isFeedbackOpen]);

  useEffect(() => {
    let cancelled = false;

    if (authLoading) return undefined;

    async function load() {
      loadedOwnerRef.current = null;
      setMapsLoading(true);
      setIsMapInitialized(false);
      hydratingRef.current = true;

      if (!user) {
        if (!cancelled) {
          setMaps([]);
          setActiveMapId(null);
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(ACTIVE_MAP_KEY);
          localStorage.removeItem(LOCAL_MAP_OWNER_KEY);

          setMapsLoading(false);
          setIsMapInitialized(true);

          clearTimeout(
            hydrationReleaseTimerRef.current
          );

          hydrationReleaseTimerRef.current =
            setTimeout(() => {
              if (!cancelled) {
                hydratingRef.current = false;
              }
            }, 0);
        }

        return;
      }

      const {
        data,
        error,
      } = !navigator.onLine ? { data: null, error: new Error("offline") } : await supabase
        .from("maps")
        .select(
          "id,user_id,name,data,created_at,updated_at"
        )
        .eq("user_id", user.id)
        .order("created_at", {
          ascending: true,
        });

      if (cancelled) return;

      let loadedMaps = [];
      let loadedActiveId = null;
      let loadedLibrary = [];

      if (error) {
        console.error(error);
        const cache = await readAccountCache(user.id).catch(() => []);
        const pending = await pendingMapSaves(user.id).catch(() => []);
        if (cancelled) return;
        const fallback = localStorage.getItem(LOCAL_MAP_OWNER_KEY) === user.id
          ? [...initial.maps, ...(privateLibrary[user.id] || [])]
          : [];
        const localItems = mergePendingMaps(cache.length ? cache : fallback, pending).map(normalizeMap);
        loadedMaps = localItems.filter((map) => !map.privateLibraryItem);
        loadedLibrary = localItems.filter((map) => map.privateLibraryItem);
        loadedActiveId = loadedMaps.find((map) => map.id === localStorage.getItem(ACTIVE_MAP_KEY))?.id || loadedMaps[0]?.id || null;
        setPrivateLibrary((current) => ({ ...current, [user.id]: loadedLibrary }));
        setSyncStatus("Нет связи с сервером. Открыта сохранённая копия; изменения отправятся после восстановления связи.");
      } else if (data?.length) {
        const remoteItems = data.map(mapFromSupabaseRow);
        loadedMaps = remoteItems.filter((map) => !map.privateLibraryItem);
        loadedLibrary = remoteItems.filter((map) => map.privateLibraryItem);

        const saved =
          localStorage.getItem(ACTIVE_MAP_KEY);

        loadedActiveId =
          loadedMaps.find(
            (m) => m.id === saved
          )?.id ||
          loadedMaps[0]?.id ||
          null;
      } else if (initial.maps.length && !localStorage.getItem(LEGACY_MAP_MIGRATION_KEY)) {
        const migrated = [];

        for (const old of initial.maps) {
          const fresh = normalizeMap({
            ...old,
            id: createMapId(),
          });

          const { error: e } =
            await supabase
              .from("maps")
              .upsert(
                mapToSupabaseRow(
                  fresh,
                  user.id
                ),
                {
                  onConflict: "id",
                }
              );

          if (!e) {
            migrated.push(fresh);
          }
        }

        loadedMaps = migrated.length
          ? migrated
          : [];

        loadedActiveId =
          migrated[0]?.id ||
          null;
      }

      if (!error) {
        const pending = await pendingMapSaves(user.id).catch(() => []);
        if (cancelled) return;
        const merged = mergePendingMaps([...loadedMaps, ...loadedLibrary], pending).map(normalizeMap);
        loadedMaps = merged.filter((map) => !map.privateLibraryItem);
        loadedLibrary = merged.filter((map) => map.privateLibraryItem);
        const localLibrary = Array.isArray(privateLibrary[user.id]) ? privateLibrary[user.id] : [];
        if (!loadedLibrary.length && localLibrary.length) {
          for (const oldItem of localLibrary) {
            const item = normalizeMap({
              ...oldItem,
              id: loadedMaps.some((map) => map.id === oldItem.id) ? createMapId() : oldItem.id,
              privateLibraryItem: true,
            });
            const { error: libraryMigrationError } = await supabase.from("maps").upsert(mapToSupabaseRow(item, user.id), { onConflict: "id" });
            if (!libraryMigrationError) loadedLibrary.push(item);
          }
        }
        setPrivateLibrary((current) => ({ ...current, [user.id]: loadedLibrary }));
        localStorage.setItem(LEGACY_MAP_MIGRATION_KEY, user.id);
        localStorage.setItem(LOCAL_MAP_OWNER_KEY, user.id);
        saveMapsLocally(loadedMaps);
      }

      const remoteCategories = [...new Set(loadedMaps.map((map) => map.category).filter((category) => category && !MAP_CATEGORIES.includes(category)))];
      setCustomCategories(remoteCategories);

      const recoveryOwner = String(
        user.user_metadata?.username
        || user.user_metadata?.user_name
        || user.user_metadata?.name
        || user.email?.split("@")[0]
        || ""
      ).toLowerCase();
      const recoveryKey = `${METRO_2035_RECOVERY_KEY}:${user.id}`;
      const existingMetro = loadedMaps.some((map) => map.name.trim().toLowerCase() === "метро 2035");
      if (!error && recoveryOwner === "majurx64" && !localStorage.getItem(recoveryKey)) {
        if (existingMetro) {
          localStorage.setItem(recoveryKey, "1");
        } else {
          const recoveredMetro = createRecoveredMetroMap(loadedMaps.length);
          const { error: recoveryError } = await supabase
            .from("maps")
            .upsert(mapToSupabaseRow(recoveredMetro, user.id), { onConflict: "id" });
          if (!recoveryError) {
            loadedMaps = [...loadedMaps, recoveredMetro];
            localStorage.setItem(recoveryKey, "1");
          } else {
            console.error("Не удалось восстановить карту Метро 2035:", recoveryError);
          }
        }
      }

      loadedOwnerRef.current = user.id;
      loadedActiveId = loadedMaps.find((map) => map.id === loadedActiveId)?.id || loadedMaps[0]?.id || null;
      setMaps(loadedMaps);
      setActiveMapId(loadedActiveId);

      const loadedActive =
        loadedMaps.find(
          (m) => m.id === loadedActiveId
        ) || null;

      if (loadedActive) {
        openMap(loadedActive);
      }

      setMapsLoading(false);
      setIsMapInitialized(true);

      clearTimeout(
        hydrationReleaseTimerRef.current
      );

      hydrationReleaseTimerRef.current =
        setTimeout(() => {
          if (!cancelled) {
            hydratingRef.current = false;
          }
        }, 0);
    }

    load();

    return () => {
      cancelled = true;

      clearTimeout(
        hydrationReleaseTimerRef.current
      );

      clearTimeout(saveTimerRef.current);
    };
  }, [user?.id, authLoading]);

  useEffect(() => {
    if (
      !isMapInitialized ||
      !activeMapId
    ) {
      return;
    }

    const next = normalizeMap({
      ...activeMap,
      mapType,
      isGameMode,
      gridMode,
      completed,
      progressCompleted,
      progressExtra,
      image,
      imageOffset,
      colors,
      imageRatio,
      totalCells,
      manualRows,
      manualCols,
      showImage,
      description,
      activityLog,
      drawColor,
      customColors,
    });

    setMaps((prev) =>
      prev.some(
        (m) => m.id === activeMapId
      )
        ? prev.map((m) =>
            m.id === activeMapId
              ? normalizeMap(addDailySnapshot(m, {
                  ...next,
                  completedAt: m.completedAt || (getMapStats(next).total > 0 && getMapStats(next).filled === getMapStats(next).total ? new Date().toISOString() : ""),
                }))
              : m
          )
        : prev
    );
  }, [
    mapType,
    isGameMode,
    gridMode,
    completed,
    progressCompleted,
    progressExtra,
    image,
    imageOffset,
    colors,
    imageRatio,
    totalCells,
    manualRows,
    manualCols,
    showImage,
    description,
    activityLog,
    drawColor,
    customColors,
  ]);

  const buildCurrentMap = useCallback(
    () =>
      activeMapId
        ? normalizeMap({
            ...activeMapRef.current,
            mapType,
            isGameMode,
            gridMode,
            completed: [
              ...completedRef.current,
            ],
            progressCompleted: [
              ...progressCompletedRef.current,
            ],
            progressExtra: progressExtraRef.current,
            image,
            imageOffset,
            colors,
            imageRatio,
            totalCells,
            manualRows,
            manualCols,
            showImage,
            description,
            activityLog: activityLogRef.current,
            drawColor,
            customColors,
          })
        : null,
    [
      activeMapId,
      mapType,
      isGameMode,
      gridMode,
      progressExtra,
      image,
      imageOffset,
      colors,
      imageRatio,
      totalCells,
      manualRows,
      manualCols,
      showImage,
      description,
      activityLog,
      drawColor,
      customColors,
    ]
  );

  const remoteSave = useCallback(
    (map, queuedEntry = null) => {
      if (!user || !map) {
        return Promise.resolve(null);
      }

      const queued = queuedEntry ? Promise.resolve(queuedEntry) : queueMapSave(user.id, normalizeMap(map)).catch(() => {
        setSyncStatus("Не удалось сохранить офлайн-копию. Скачай резервную копию.");
        return null;
      });
      const run = async () => {
        const pending = await queued;
        if (queuedEntry) {
          const entries = await pendingMapSaves(user.id);
          if (!entries.some((entry) => entry.key === queuedEntry.key && entry.revision === queuedEntry.revision)) return null;
        }
        if (deletingIdsRef.current.has(map.id)) return null;
        if (latestOwnerRef.current !== user.id) return new Error("account-changed");
        if (!navigator.onLine) {
          setSyncStatus(pending ? "Сохранено на устройстве. Ожидаем подключения." : "Нет связи; скачай резервную копию.");
          return new Error("offline");
        }
        try {
          const { error } =
            await supabase
              .from("maps")
              .upsert(
                mapToSupabaseRow(
                  map,
                  user.id
                ),
                {
                  onConflict: "id",
                }
              );

          if (error) {
            setSyncStatus("Сохранено на устройстве. Сервер пока недоступен.");
            console.error(
              "Ошибка автосохранения:",
              error
            );

            return error;
          }

          if (pending) await acknowledgeMapSave(pending);
          setSyncStatus("");
          return null;
        } catch (error) {
          console.error(
            "Ошибка автосохранения:",
            error
          );

          return error;
        }
      };

      const request =
        remoteSaveQueueRef.current.then(
          run,
          run
        );

      remoteSaveQueueRef.current =
        request.catch(() => null);

      return request;
    },
    [user]
  );

  useEffect(() => {
    if (!user?.id || !isMapInitialized || loadedOwnerRef.current !== user.id) return;
    let cancelled = false;
    const flush = async () => {
      if (!navigator.onLine || cancelled) return;
      const entries = await pendingMapSaves(user.id).catch(() => []);
      for (const entry of entries) {
        if (cancelled || latestOwnerRef.current !== user.id) return;
        await remoteSave(entry.map, entry);
      }
    };
    void flush();
    window.addEventListener("online", flush);
    return () => { cancelled = true; window.removeEventListener("online", flush); };
  }, [user?.id, isMapInitialized, remoteSave]);

  useEffect(() => {
    if (
      !isMapInitialized ||
      hydratingRef.current ||
      !activeMapId ||
      !user ||
      publicLibraryEditContext
    ) {
      return;
    }

    clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(() => {
      const current = buildCurrentMap();
      const map = current ? normalizeMap(addChangeSnapshot(current, pendingVersionSequenceRef.current)) : null;
      pendingVersionSequenceRef.current = [];

      if (map) {
        activeMapRef.current = map;
        setMaps((stored) => stored.map((item) => item.id === map.id ? map : item));
        remoteSave(map);
      }
    }, 700);

    return () =>
      clearTimeout(saveTimerRef.current);
  }, [
    mapType,
    isGameMode,
    gridMode,
      completed,
      progressCompleted,
      progressExtra,
    image,
    imageOffset,
    colors,
    imageRatio,
    totalCells,
    manualRows,
    manualCols,
    showImage,
    description,
    activityLog,
    drawColor,
    customColors,
    isMapInitialized,
    user,
    activeMapId,
    buildCurrentMap,
    remoteSave,
    publicLibraryEditContext,
  ]);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (
        accountRef.current &&
        !accountRef.current.contains(e.target)
      ) {
        closeAccountMenu();
      }
      if (
        languageRef.current &&
        !languageRef.current.contains(e.target)
      ) {
        setIsLanguageOpen(false);
      }
    };

    document.addEventListener(
      "mousedown",
      handleOutsideClick
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutsideClick
      );
    };
  }, []);

  useEffect(() => {
    if (!isEditingAccountName) return undefined;
    accountNameInputRef.current?.focus({ preventScroll: true });
    const closeNameOnOutsidePointer = (event) => {
      if (!accountNameEditorRef.current?.contains(event.target)) {
        setIsClosingAccountName(true);
        window.clearTimeout(accountNameCloseTimerRef.current);
        accountNameCloseTimerRef.current = window.setTimeout(() => {
          setIsEditingAccountName(false);
          setIsClosingAccountName(false);
        }, 180);
      }
    };
    document.addEventListener("pointerdown", closeNameOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeNameOnOutsidePointer);
  }, [isEditingAccountName]);

  useEffect(() => () => window.clearTimeout(accountNameCloseTimerRef.current), []);
  useEffect(() => () => {
    window.clearTimeout(feedbackThanksAutoTimerRef.current);
    window.clearTimeout(feedbackThanksCloseTimerRef.current);
  }, []);

  useEffect(() => {
    if (!user || !isLibraryOwner) return undefined;
    let cancelled = false;
    let initialLoad = true;
    async function loadFeedbackMessages() {
      if (!cancelled && initialLoad) setFeedbackInboxLoading(true);
      const { data, error } = await supabase
        .from(FEEDBACK_TABLE)
        .select("*")
        .order("created_at", { ascending: false });
      if (!cancelled && !error) {
        setFeedbackMessages(data || []);
        setFeedbackNoteDrafts((previous) => {
          const next = { ...previous };
          (data || []).forEach((message) => {
            if (!(message.id in next)) next[message.id] = message.owner_note || "";
          });
          return next;
        });
      }
      if (!cancelled && initialLoad) setFeedbackInboxLoading(false);
      initialLoad = false;
    }
    loadFeedbackMessages();
    const refreshOnFocus = () => loadFeedbackMessages();
    window.addEventListener("focus", refreshOnFocus);
    const timer = window.setInterval(loadFeedbackMessages, 30000);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshOnFocus);
      window.clearInterval(timer);
    };
  }, [user?.id, isLibraryOwner]);

  useEffect(() => {
    if (authLoading || isLibraryOwner) return;
    if (!analyticsSessionTrackedRef.current) {
      analyticsSessionTrackedRef.current = true;
      trackAnalytics("session_start", { userId: user?.id });
    }
    trackAnalytics("page_view", { userId: user?.id, metadata: { screen } });
  }, [screen, authLoading, isLibraryOwner, user?.id]);

  useEffect(() => {
    if (authLoading || isLibraryOwner) return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") trackAnalytics("active_seconds", { value: 60, userId: user?.id });
    }, 60000);
    const flushOnHide = () => { if (document.visibilityState === "hidden") void flushAnalytics(); };
    document.addEventListener("visibilitychange", flushOnHide);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", flushOnHide);
    };
  }, [authLoading, isLibraryOwner, user?.id]);

  useEffect(() => {
    if (!isLibraryOwner || screen !== "analytics") return;
    let cancelled = false;
    setAnalyticsLoading(true);
    setAnalyticsError("");
    supabase.rpc("analytics_dashboard", { period_days: analyticsPeriod }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) setAnalyticsError("Не удалось загрузить статистику.");
      else setAnalyticsData(data);
      setAnalyticsLoading(false);
    });
    return () => { cancelled = true; };
  }, [screen, isLibraryOwner, analyticsPeriod]);

  async function handleSignOut() {
    closeAccountMenu();

    const currentMap = buildCurrentMap();
    if (currentMap) await remoteSave(currentMap);

    const signingOutUserId = user?.id;
    const { error } = await supabase.auth.signOut({ scope: "local" });

    if (error) {
      console.error(
        "Ошибка выхода:",
        error
      );

      return;
    }

    setMaps([]);
    setActiveMapId(null);
    setCustomColors([]);
    setCustomCategories([]);
    setCategoryOrder([]);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(ACTIVE_MAP_KEY);
    localStorage.removeItem(LOCAL_MAP_OWNER_KEY);
    localStorage.removeItem(CUSTOM_COLORS_KEY);
    localStorage.removeItem(CUSTOM_CATEGORIES_KEY);
    localStorage.removeItem(CATEGORY_ORDER_KEY);
    setSavedAccounts((previous) => {
      const next = previous.filter((account) => account.id !== signingOutUserId);
      localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(next));
      return next;
    });

    setScreen("home");
    localStorage.setItem(
      CURRENT_SCREEN_KEY,
      "home"
    );
  }

  async function handleSwitchAccount() {
    closeAccountMenu();
    const currentMap = buildCurrentMap();
    if (currentMap) await remoteSave(currentMap);
    setScreen("auth");
    localStorage.setItem(CURRENT_SCREEN_KEY, "auth");
  }

  async function switchToSavedAccount(account) {
    const currentMap = buildCurrentMap();
    if (currentMap) remoteSave(currentMap);
    closeAccountMenu();
    setIsAccountSwitcherOpen(false);
    setSwitchingAccountId(account.id);
    const { error } = await supabase.auth.setSession({
      access_token: account.accessToken,
      refresh_token: account.refreshToken,
    });
    if (error) {
      setSavedAccounts((previous) => {
        const next = previous.filter((saved) => saved.id !== account.id);
        localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(next));
        return next;
      });
      console.error("Не удалось переключить аккаунт:", error);
      setSwitchingAccountId(null);
      return;
    }
    setScreen("account");
    setSwitchingAccountId(null);
  }

  function reorderSavedAccounts(draggedId, targetId) {
    if (!draggedId || draggedId === targetId) return;
    savedAccountPositionsRef.current = new Map(
      [...document.querySelectorAll("[data-saved-account-id]")].map((element) => [
        element.dataset.savedAccountId,
        element.getBoundingClientRect().top,
      ])
    );
    setSavedAccounts((previous) => {
      const currentFrom = previous.findIndex((account) => account.id === draggedId);
      const currentTo = previous.findIndex((account) => account.id === targetId);
      if (currentFrom < 0 || currentTo < 0) return previous;
      const next = [...previous];
      const [moved] = next.splice(currentFrom, 1);
      next.splice(currentTo, 0, moved);
      localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(next));
      return next;
    });
  }

  function startSavedAccountDrag(event, account) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const row = event.currentTarget.closest("[data-saved-account-id]");
    if (!row) return;
    const bounds = row.getBoundingClientRect();
    suppressSavedAccountClickRef.current = true;
    savedAccountPointerRef.current = {
      id: account.id,
      account,
      pointerId: event.pointerId,
      startY: event.clientY,
      grabOffset: event.clientY - bounds.top,
      bounds,
      dragging: false,
      targetId: null,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveSavedAccountDrag(event) {
    const drag = savedAccountPointerRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (!drag.dragging && Math.abs(event.clientY - drag.startY) < 10) return;
    if (!drag.dragging) {
      drag.dragging = true;
      setSavedAccountDragId(drag.id);
      setSavedAccountDragVisual({
        account: drag.account,
        left: drag.bounds.left,
        top: drag.bounds.top,
        width: drag.bounds.width,
        height: drag.bounds.height,
        settling: false,
      });
    }
    setSavedAccountDragVisual((current) => current ? {
      ...current,
      top: event.clientY - drag.grabOffset,
      settling: false,
    } : current);
    const target = [...document.querySelectorAll("[data-saved-account-id]")]
      .filter((element) => element.dataset.savedAccountId !== drag.id)
      .find((element) => {
        const bounds = element.getBoundingClientRect();
        return event.clientY >= bounds.top && event.clientY <= bounds.bottom;
      });
    const targetId = target?.dataset.savedAccountId;
    drag.targetId = targetId && targetId !== drag.id ? targetId : null;
    setSavedAccountDropId(drag.targetId);
  }

  function finishSavedAccountDrag(event, cancelled = false) {
    const drag = savedAccountPointerRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    savedAccountPointerRef.current = null;
    if (!cancelled && drag.dragging && drag.targetId) {
      const target = document.querySelector(`[data-saved-account-id="${CSS.escape(drag.targetId)}"]`);
      const targetBounds = target?.getBoundingClientRect();
      if (targetBounds) {
        setSavedAccountDragVisual((current) => current ? {
          ...current,
          top: targetBounds.top,
          settling: true,
        } : current);
      }
      reorderSavedAccounts(drag.id, drag.targetId);
      window.setTimeout(() => {
        setSavedAccountDragId(null);
        setSavedAccountDropId(null);
        setSavedAccountDragVisual(null);
      }, 240);
    } else {
      setSavedAccountDragId(null);
      setSavedAccountDropId(null);
      setSavedAccountDragVisual(null);
    }
    window.setTimeout(() => { suppressSavedAccountClickRef.current = false; }, 300);
  }

  function confirmRemoveSavedAccount() {
    if (!accountToRemove || removingSavedAccountId) return;
    const accountId = accountToRemove.id;
    setIsAccountRemoveClosing(true);
    window.setTimeout(() => {
      setAccountToRemove(null);
      setIsAccountRemoveClosing(false);
      setRemovingSavedAccountId(accountId);
      window.setTimeout(() => {
        setSavedAccounts((previous) => {
          const next = previous.filter((account) => account.id !== accountId);
          localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(next));
          return next;
        });
        setRemovingSavedAccountId(null);
      }, 380);
    }, 260);
  }

  function closeAccountRemoveModal() {
    if (!accountToRemove || isAccountRemoveClosing) return;
    setIsAccountRemoveClosing(true);
    window.setTimeout(() => {
      setAccountToRemove(null);
      setIsAccountRemoveClosing(false);
    }, 260);
  }

  async function updateFeedbackAdminField(messageId, patch) {
    const previous = feedbackMessages.find((message) => message.id === messageId);
    if (!previous) return;
    setFeedbackMessages((messages) => messages.map((message) => message.id === messageId ? { ...message, ...patch } : message));
    setFeedbackAdminState((state) => ({ ...state, [messageId]: "saving" }));
    const { error } = await supabase.from(FEEDBACK_TABLE).update(patch).eq("id", messageId);
    if (error) {
      setFeedbackMessages((messages) => messages.map((message) => message.id === messageId ? previous : message));
      setFeedbackAdminState((state) => ({ ...state, [messageId]: "error" }));
      return;
    }
    setFeedbackAdminState((state) => ({ ...state, [messageId]: "saved" }));
    window.setTimeout(() => {
      setFeedbackAdminState((state) => state[messageId] === "saved" ? { ...state, [messageId]: "" } : state);
    }, 1400);
  }

  function openFeedbackDeleteModal(messages) {
    const targets = Array.isArray(messages) ? messages : [messages];
    if (!targets.length) return;
    setFeedbackDeleteError("");
    setIsFeedbackDeleteClosing(false);
    setFeedbackDeleteTargets(targets);
  }

  function closeFeedbackDeleteModal() {
    if (!feedbackDeleteTargets.length || isFeedbackDeleteClosing || feedbackDeletingIds.length) return;
    setIsFeedbackDeleteClosing(true);
    window.setTimeout(() => {
      setFeedbackDeleteTargets([]);
      setIsFeedbackDeleteClosing(false);
      setFeedbackDeleteError("");
    }, 260);
  }

  async function confirmDeleteFeedback() {
    if (!feedbackDeleteTargets.length || feedbackDeletingIds.length || !isLibraryOwner) return;
    const messages = feedbackDeleteTargets;
    const messageIds = messages.map((message) => message.id);
    setFeedbackDeletingIds(messageIds);
    setFeedbackDeleteError("");
    const { error } = await supabase.from(FEEDBACK_TABLE).delete().in("id", messageIds);
    if (error) {
      setFeedbackDeletingIds([]);
      setFeedbackDeleteError("Не удалось удалить обращение.");
      return;
    }
    const attachmentPaths = messages.flatMap((message) => message.attachments || []).map((attachment) => attachment.path).filter(Boolean);
    if (attachmentPaths.length) await supabase.storage.from(FEEDBACK_BUCKET).remove(attachmentPaths);
    setIsFeedbackDeleteClosing(true);
    window.setTimeout(() => {
      setFeedbackMessages((current) => current.filter((entry) => !messageIds.includes(entry.id)));
      setFeedbackDeleteTargets([]);
      setIsFeedbackDeleteClosing(false);
      setFeedbackDeletingIds([]);
      setFeedbackSelectedIds((ids) => ids.filter((id) => !messageIds.includes(id)));
      setFeedbackNoteDrafts((drafts) => {
        const next = { ...drafts };
        messageIds.forEach((id) => delete next[id]);
        return next;
      });
    }, 260);
  }

  function closeFeedbackThanks() {
    if (isFeedbackThanksClosing) return;
    window.clearTimeout(feedbackThanksAutoTimerRef.current);
    window.clearTimeout(feedbackThanksCloseTimerRef.current);
    setIsFeedbackThanksClosing(true);
    feedbackThanksCloseTimerRef.current = window.setTimeout(() => {
      setShowFeedbackThanks(false);
      setIsFeedbackThanksClosing(false);
    }, 300);
  }

  async function openFeedbackInbox() {
    closeAccountMenu();
    setScreen("feedback-inbox");
    const unreadIds = feedbackMessages.filter((message) => !message.is_read).map((message) => message.id);
    if (!unreadIds.length) return;
    const { error } = await supabase.from(FEEDBACK_TABLE).update({ is_read: true }).in("id", unreadIds);
    if (!error) setFeedbackMessages((previous) => previous.map((message) => ({ ...message, is_read: true })));
  }

  async function openFeedbackAttachment(attachment) {
    if (!attachment?.path) {
      if (attachment?.url) window.open(attachment.url, "_blank", "noopener,noreferrer");
      return;
    }
    const { data, error } = await supabase.storage.from(FEEDBACK_BUCKET).createSignedUrl(attachment.path, 60 * 60);
    if (!error && data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  function selectDrawColor(c) {
    const v = normalizeHexColor(c);

    if (!v) return;

    setDrawColor(v);
    setNewColor(v);
    drawColorRef.current = v;
  }

  function addCustomColor() {
    const c = normalizeHexColor(newColor);

    if (!c) return;

    if (BASIC_COLORS.includes(c)) {
      selectDrawColor(c);
      return;
    }

    setCustomColors((p) =>
      p.includes(c) ? p : [...p, c]
    );

    selectDrawColor(c);
  }

  function deleteCustomColor(c) {
    if (BASIC_COLORS.includes(c)) return;

    setCustomColors((p) =>
      p.filter((x) => x !== c)
    );

    if (drawColor === c) {
      selectDrawColor(
        BASIC_COLORS[0]
      );
    }
  }

  function clearHistory() {
    undoStackRef.current = [];
    redoStackRef.current = [];
  }

  function recordVersionCellChanges(changes, mode = "draw") {
    if (!changes?.length) return;
    const encoded = changes.map((cell) => {
      const index = typeof cell === "number" ? cell : cell.index;
      const cellMode = typeof cell === "number" ? mode : cell.mode;
      return cellMode === "erase" ? -(index + 1) : index;
    });
    pendingVersionSequenceRef.current = [
      ...pendingVersionSequenceRef.current,
      ...encoded,
    ].slice(-(MAX_CELLS * 4));
  }

  function pushHistory(
    before,
    after,
    beforeColors,
    afterColors,
    target = "drawing",
    sequence = []
  ) {
    const b = {
      completed: [...before],
      colors: [...beforeColors],
    };

    const a = {
      completed: [...after],
      colors: [...afterColors],
    };

    if (sameState(b, a)) return;

    undoStackRef.current.push({
      before: b,
      after: a,
      target,
      sequence: [...sequence],
    });

    if (
      undoStackRef.current.length > 100
    ) {
      undoStackRef.current.shift();
    }
  }

  function stopProgressSequence() {
    gameFillTimersRef.current.forEach(window.clearTimeout);
    gameFillTimersRef.current = [];
    window.cancelAnimationFrame(gameFillAnimationRef.current);
    gameFillAnimationRef.current = null;
    if (cellAnimationsRef.current.size) {
      cellAnimationsRef.current.clear();
      setCellAnimationTick((tick) => tick + 1);
    }
  }

  function runProgressSequence(sequence, targetCompleted, onComplete, reverse = false) {
    stopProgressSequence();
    const current = new Set(progressCompletedRef.current);
    const target = new Set(targetCompleted);
    const sequenceSet = new Set(sequence);
    const remaining = [...new Set([...current, ...target])]
      .filter((index) => current.has(index) !== target.has(index) && !sequenceSet.has(index));
    const changedSequence = sequence
      .filter((index) => current.has(index) !== target.has(index));
    if (reverse) changedSequence.reverse();
    const ordered = [
      ...changedSequence,
      ...remaining,
    ];

    if (!ordered.length) {
      progressCompletedRef.current = target;
      setProgressCompleted([...target]);
      onComplete?.();
      return;
    }

    const working = new Set(current);
    const cadence = Math.max(8, Math.min(38, 1800 / ordered.length));
    const startedAt = performance.now();
    let cursor = 0;

    const advance = (now) => {
      const nextCursor = Math.min(
        ordered.length,
        Math.max(cursor + 1, Math.floor((now - startedAt) / cadence) + 1)
      );
      const animations = [];
      while (cursor < nextCursor) {
        const index = ordered[cursor];
        const mode = target.has(index) ? "draw" : "erase";
        if (mode === "draw") working.add(index);
        else working.delete(index);
        animations.push({ index, mode });
        cursor += 1;
      }
      animateCells(animations);
      recordVersionCellChanges(animations);
      progressCompletedRef.current = new Set(working);
      setProgressCompleted([...working]);

      if (cursor < ordered.length) {
        gameFillAnimationRef.current = window.requestAnimationFrame(advance);
        return;
      }
      gameFillAnimationRef.current = null;
      progressCompletedRef.current = target;
      setProgressCompleted([...target]);
      onComplete?.();
    };

    gameFillAnimationRef.current = window.requestAnimationFrame(advance);
  }

  function setSnapshot(s, target = "drawing", sequence = [], reverseSequence = false) {
    setSelection(null);
    if (target === "grid") {
      gridRestoreRef.current = null;
      setGridMode(s.gridMode);
      setTotalCells(String(s.totalCells));
      setManualRows(String(s.manualRows));
      setManualCols(String(s.manualCols));
      completedRef.current = new Set(s.completed);
      progressCompletedRef.current = new Set(s.progressCompleted);
      colorsRef.current = [...s.colors];
      setCompleted([...s.completed]);
      setProgressCompleted([...s.progressCompleted]);
      setColors([...s.colors]);
      if (s.imageOffset) setImageOffset(s.imageOffset);
      return;
    }
    if (target === "progress" && sequence.length) {
      runProgressSequence(sequence, s.completed, undefined, reverseSequence);
      return;
    }
    if (s.progressCompleted) {
      progressCompletedRef.current = new Set(s.progressCompleted);
      setProgressCompleted(s.progressCompleted);
    }
    if (s.imageOffset) {
      imageProcessingRef.current += 1;
      setImageOffset(s.imageOffset);
    }
    const current = target === "progress"
      ? progressCompletedRef.current
      : completedRef.current;
    const next = new Set(s.completed);
    const changed = [...new Set([...current, ...next])]
      .filter((index) => current.has(index) !== next.has(index))
      .map((index) => ({
        index,
        mode: current.has(index) ? "erase" : "draw",
      }));
    animateCells(changed);
    recordVersionCellChanges(changed);

    if (target === "progress") {
      progressCompletedRef.current = next;
      setProgressCompleted([...s.completed]);
      return;
    }

    completedRef.current = next;

    colorsRef.current = [
      ...s.colors,
    ];

    setCompleted([
      ...s.completed,
    ]);

    setColors([
      ...s.colors,
    ]);
  }

  function undo() {
    if (isDrawingRef.current || artworkDragRef.current || selectionGestureRef.current || panGestureRef.current) {
      return;
    }

    stopProgressSequence();
    const a =
      undoStackRef.current.pop();

    if (!a) return;

    redoStackRef.current.push(a);
    setSnapshot(a.before, a.target, a.sequence || [], true);
  }

  function redo() {
    if (isDrawingRef.current || artworkDragRef.current || selectionGestureRef.current || panGestureRef.current) {
      return;
    }

    stopProgressSequence();
    const a =
      redoStackRef.current.pop();

    if (!a) return;

    undoStackRef.current.push(a);
    setSnapshot(a.after, a.target, a.sequence);
  }

  function getCellFromPointerEvent(e) {
    const c = canvasRef.current;

    if (!c) return null;

    const r =
      c.getBoundingClientRect();

    const x = e.clientX - r.left;
    const y = e.clientY - r.top;

    if (
      x < 0 ||
      y < 0 ||
      x >= r.width ||
      y >= r.height
    ) {
      return null;
    }

    const col = Math.min(
      cols - 1,
      Math.floor(
        (x / r.width) * cols
      )
    );

    const row = Math.min(
      rows - 1,
      Math.floor(
        (y / r.height) * rows
      )
    );

    const index = row * cols + col;

    // В ручной сетке последние ячейки могут быть только техническим
    // заполнением прямоугольника. Они не входят в выбранное число клеток.
    return index < actualTotal ? index : null;
  }

  function animateCells(cells, mode = "draw") {
    if (!cells?.length) return;

    const startedAt = performance.now();
    cells.forEach((cell) => {
      const index = typeof cell === "number" ? cell : cell.index;
      const cellMode = typeof cell === "number" ? mode : cell.mode;
      cellAnimationsRef.current.set(index, {
        startedAt,
        mode: cellMode,
        color:
          cellMode === "erase"
            ? colorsRef.current[index] || drawColorRef.current
            : null,
      });
    });
    setCellAnimationTick((tick) => tick + 1);

    window.clearTimeout(cellAnimationTimerRef.current);
    cellAnimationTimerRef.current = window.setTimeout(() => {
      cellAnimationsRef.current.clear();
      setCellAnimationTick((tick) => tick + 1);
    }, 300);
  }

  function recordPaintedCells(count) {
    if (!count) return;

    const now = new Date();
    const date = getActivityDate(now);
    const previousToday = activityLogRef.current
      .filter((entry) => entry.date === date)
      .reduce((sum, entry) => sum + Number(entry.cells || 0), 0);
    const todayCells = Math.max(0, previousToday + count);
    const next = normalizeActivityLog([
      ...activityLogRef.current.filter((entry) => entry.date !== date),
      ...(todayCells ? [{ date, cells: todayCells }] : []),
    ]);
    activityLogRef.current = next;
    setActivityLog(next);

    const currentMap = activeMapRef.current;
    if (currentMap?.deadline) {
      const mapWithCurrentProgress = {
        ...currentMap,
        mapType,
        gridMode,
        totalCells,
        imageRatio,
        manualRows,
        manualCols,
        completed: [...completedRef.current],
        progressCompleted: [...progressCompletedRef.current],
        activityLog: next,
      };
      const stats = getMapStats(mapWithCurrentProgress);

      const quotaMet = dailyQuotaMet(mapWithCurrentProgress, stats.total, stats.filled, now);
      const dailyPlanDoneOn = quotaMet ? date : currentMap.dailyPlanDoneOn === date ? "" : currentMap.dailyPlanDoneOn;
      activeMapRef.current = { ...currentMap, activityLog: next, dailyPlanDoneOn };
      setMaps((mapsNow) => mapsNow.map((map) =>
        map.id === activeMapId ? { ...map, dailyPlanDoneOn } : map
      ));
    }
  }

  function applyCells(indices, mode) {
    if (!indices?.length) return;
    gridRestoreRef.current = null;
    indices = indices.filter((i) => i >= 0 && i < actualTotal);

    if (isGameMode) {
      const next = new Set(progressCompletedRef.current);
      const changed = [];

      for (const i of indices) {
        // В игре можно отмечать только клетки готового рисунка.
        if (mapType === "free" && !completedRef.current.has(i)) continue;
        if (mode === "draw" && !next.has(i)) {
          next.add(i);
          changed.push(i);
        } else if (mode !== "draw" && next.has(i)) {
          next.delete(i);
          changed.push(i);
        }
      }

      animateCells(changed, mode);
      recordVersionCellChanges(changed, mode);
      progressCompletedRef.current = next;
      setProgressCompleted([...next]);
      recordPaintedCells(mode === "draw" ? changed.length : -changed.length);
      strokeCountRef.current += changed.length;
      return;
    }

    const nextSet =
      new Set(completedRef.current);

    const nextColors =
      mapType === "free"
        ? [...colorsRef.current]
        : null;
    const changed = [];
    let painted = 0;

    for (const i of indices) {
      if (mode === "draw") {
        if (!nextSet.has(i) || (nextColors && nextColors[i] !== drawColorRef.current)) painted++;
        if (!nextSet.has(i)) changed.push(i);
        nextSet.add(i);

        if (nextColors) {
          nextColors[i] =
            drawColorRef.current;
        }
      } else {
        if (nextSet.has(i)) changed.push(i);
        nextSet.delete(i);

        if (nextColors) {
          delete nextColors[i];
        }
      }
    }

    animateCells(changed, mode);
    recordVersionCellChanges(changed, mode);
    completedRef.current = nextSet;
    setCompleted([...nextSet]);
    recordPaintedCells(mode === "draw" ? changed.length : -changed.length);
    strokeCountRef.current += mode === "draw" ? painted : changed.length;

    if (nextColors) {
      colorsRef.current = nextColors;
      setColors(nextColors);
    }
  }

  function startStroke(
    index,
    mode,
    pointerId
  ) {
    if (isDrawingRef.current) {
      finishStroke();
    }

    strokeCountRef.current = 0;
    isDrawingRef.current = true;
    drawModeRef.current = mode;
    previousCellRef.current = index;
    activePointerIdRef.current =
      pointerId;

    strokeBeforeRef.current =
      new Set(
        isGameMode
          ? progressCompletedRef.current
          : completedRef.current
      );

    strokeColorsBeforeRef.current =
      [...colorsRef.current];

    strokeVisitedRef.current =
      new Set([index]);

    redoStackRef.current = [];

    applyCells(
      [index],
      mode
    );

    setIsDrawing(true);
    setDrawMode(mode);
  }

  function continueStroke(index) {
    if (!isDrawingRef.current)
      return;

    const p =
      previousCellRef.current;

    if (p === null) {
      previousCellRef.current =
        index;
      return;
    }

    if (index === p) return;

    const line = getLineCells(
      p,
      index,
      cols,
      rows
    );

    const fresh = line.filter(
      (i) =>
        !strokeVisitedRef.current.has(
          i
        )
    );

    line.forEach((i) =>
      strokeVisitedRef.current.add(i)
    );

    if (fresh.length) {
      applyCells(
        fresh,
        drawModeRef.current
      );
    }

    previousCellRef.current =
      index;
  }

  function finishStroke() {
    if (!isDrawingRef.current)
      return;

    if (strokeCountRef.current > 0) {
      const lastPaintedAt = new Date().toISOString();
      activeMapRef.current = { ...activeMapRef.current, lastPaintedAt };
      setMaps((previous) => previous.map((map) => (
        map.id === activeMapId ? { ...map, lastPaintedAt } : map
      )));
      recordAnalytics(drawModeRef.current === "draw" ? "cells_painted" : "cells_erased", {
        value: strokeCountRef.current,
        metadata: { mode: isGameMode ? "game" : "drawing" },
      });
    }

    isDrawingRef.current = false;
    setStrokeCounter(null);
    setIsDrawing(false);

    const before =
      strokeBeforeRef.current;

    if (before) {
      const after =
        new Set(
          isGameMode
            ? progressCompletedRef.current
            : completedRef.current
        );

      pushHistory(
        before,
        after,
        strokeColorsBeforeRef.current,
        colorsRef.current,
        isGameMode ? "progress" : "drawing"
      );
    }

    strokeBeforeRef.current =
      null;

    strokeColorsBeforeRef.current =
      [];

    strokeVisitedRef.current =
      new Set();

    previousCellRef.current =
      null;

    activePointerIdRef.current =
      null;
  }

  function handlePointerDown(e) {
    e.preventDefault();
    if (e.button !== 0 && e.button !== 2) return;
    if (isDrawingRef.current || artworkDragRef.current || selectionGestureRef.current || panGestureRef.current) return;
    const i = getCellFromPointerEvent(e);
    if (i === null) return;
    canvasRef.current?.focus({ preventScroll: true });
    canvasRef.current?.setPointerCapture(e.pointerId);
    const currentSet = isGameMode ? progressCompletedRef.current : completedRef.current;
    if (e.button === 2 && !currentSet.has(i)) {
      suppressContextMenuRef.current = true;
      panGestureRef.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, left: viewportRef.current.scrollLeft, top: viewportRef.current.scrollTop };
      return;
    }
    if (e.button === 0 && !isGameMode && (selectionTool || e.ctrlKey || selectionContains(selection, i, cols))) {
      if (selectionContains(selection, i, cols)) {
        setSelectionReady(false);
        artworkDragRef.current = {
          pointerId: e.pointerId, x: e.clientX, y: e.clientY, rect: canvasRef.current.getBoundingClientRect(), area: selection,
          clientX: e.clientX, clientY: e.clientY,
          scrollLeft: viewportRef.current.scrollLeft, scrollTop: viewportRef.current.scrollTop,
          completed: [...completedRef.current], progressCompleted: [...progressCompletedRef.current],
          colors: [...colorsRef.current], imageOffset: { ...imageOffset }, dx: 0, dy: 0,
        };
        startArtworkDragTracking();
        setMovingArtwork(true);
      } else {
        setSelectionReady(false);
        selectionGestureRef.current = { pointerId: e.pointerId, start: i };
        setSelection(selectionFromCells(i, i, cols));
      }
      return;
    }
    setSelection(null);

    // Браузер присылает contextmenu уже после pointerup. Запоминаем
    // именно ПКМ-штрих внутри холста, чтобы меню не всплывало снаружи.
    if (e.button === 2) suppressContextMenuRef.current = true;

    const sameColor = isGameMode || mapType === "image" || colorsRef.current[i]?.toLowerCase() === drawColorRef.current.toLowerCase();
    const mode = e.button === 2 || (currentSet.has(i) && sameColor) ? "erase" : "draw";

    strokeButtonRef.current = e.button === 2 ? 2 : 1;
    startStroke(
      i,
      mode,
      e.pointerId
    );
  }

  function updateArtworkDrag(drag, clientX, clientY) {
    const viewport = viewportRef.current;
    if (!drag || !viewport) return;
    drag.clientX = clientX;
    drag.clientY = clientY;
    const pointerX = clientX - drag.x + viewport.scrollLeft - drag.scrollLeft;
    const pointerY = clientY - drag.y + viewport.scrollTop - drag.scrollTop;
    const result = moveSelection(drag, drag.area, { cols, rows, actualTotal }, Math.round(pointerX / drag.rect.width * cols), Math.round(pointerY / drag.rect.height * rows), mapType === "image");
    if (!result || (result.dx === drag.dx && result.dy === drag.dy)) return;
    drag.dx = result.dx; drag.dy = result.dy;
    setCompletedDirectly(result.completed);
    progressCompletedRef.current = new Set(result.progressCompleted);
    setProgressCompleted(result.progressCompleted);
    colorsRef.current = result.colors;
    setColors(result.colors);
    if (mapType === "image") {
      imageProcessingRef.current += 1;
      setImageOffset({ ...drag.imageOffset, cellsEdited: true });
    }
    setSelection(result.area);
  }

  function handleEditorViewportScroll() {
    const drag = artworkDragRef.current;
    if (drag) updateArtworkDrag(drag, drag.clientX, drag.clientY);
  }

  function startArtworkDragTracking() {
    window.cancelAnimationFrame(artworkDragFrameRef.current);
    const followScroll = () => {
      const drag = artworkDragRef.current;
      if (!drag) {
        artworkDragFrameRef.current = 0;
        return;
      }
      updateArtworkDrag(drag, drag.clientX, drag.clientY);
      artworkDragFrameRef.current = window.requestAnimationFrame(followScroll);
    };
    artworkDragFrameRef.current = window.requestAnimationFrame(followScroll);
  }

  function stopArtworkDragTracking() {
    window.cancelAnimationFrame(artworkDragFrameRef.current);
    artworkDragFrameRef.current = 0;
  }

  function handlePointerMove(e) {
    const pan = panGestureRef.current;
    if (pan?.pointerId === e.pointerId) {
      viewportRef.current.scrollLeft = pan.left + pan.x - e.clientX;
      viewportRef.current.scrollTop = pan.top + pan.y - e.clientY;
      return;
    }
    const marquee = selectionGestureRef.current;
    if (marquee?.pointerId === e.pointerId) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(cols - 1, Math.floor((e.clientX - rect.left) / rect.width * cols)));
      const y = Math.max(0, Math.min(rows - 1, Math.floor((e.clientY - rect.top) / rect.height * rows)));
      setSelection(selectionFromCells(marquee.start, y * cols + x, cols));
      return;
    }
    const drag = artworkDragRef.current;
    if (drag?.pointerId === e.pointerId) {
      updateArtworkDrag(drag, e.clientX, e.clientY);
      return;
    }
    if (!isDrawingRef.current)
      return;

    if (
      activePointerIdRef.current !==
        null &&
      e.pointerId !==
        activePointerIdRef.current
    ) {
      return;
    }

    if (!(e.buttons & strokeButtonRef.current)) {
      finishStroke();
      return;
    }
    const events =
      typeof e.getCoalescedEvents ===
      "function"
        ? e.getCoalescedEvents()
        : [];

    let last = null;

    for (const x of events) {
      const i =
        getCellFromPointerEvent(x);

      if (i !== null) {
        continueStroke(i);
        last = i;
      }
    }

    const i =
      getCellFromPointerEvent(e);

    if (
      i !== null &&
      i !== last
    ) {
      continueStroke(i);
    }
    if (strokeCountRef.current >= 2) setStrokeCounter({ x: e.clientX, y: e.clientY, count: strokeCountRef.current });
  }

  function handlePointerUp(e) {
    if (panGestureRef.current?.pointerId === e.pointerId || selectionGestureRef.current?.pointerId === e.pointerId) {
      handlePointerMove(e);
      if (selectionGestureRef.current?.pointerId === e.pointerId) setSelectionReady(true);
      panGestureRef.current = null;
      selectionGestureRef.current = null;
      canvasRef.current?.releasePointerCapture(e.pointerId);
      return;
    }
    if (artworkDragRef.current?.pointerId === e.pointerId) {
      handlePointerMove(e);
      finishArtworkMove();
      setSelectionReady(true);
      canvasRef.current?.releasePointerCapture(e.pointerId);
      return;
    }
    if (
      activePointerIdRef.current !==
        null &&
      e.pointerId !==
        activePointerIdRef.current
    ) {
      return;
    }

    const i =
      getCellFromPointerEvent(e);

    if (i !== null) {
      continueStroke(i);
    }

    try {
      if (
        canvasRef.current?.hasPointerCapture?.(
          e.pointerId
        )
      ) {
        canvasRef.current.releasePointerCapture(
          e.pointerId
        );
      }
    } catch {}

    finishStroke();
  }

  function handlePointerCancel() {
    panGestureRef.current = null;
    if (selectionGestureRef.current) {
      setSelection(null);
      setSelectionReady(false);
    }
    selectionGestureRef.current = null;
    if (artworkDragRef.current) {
      setSnapshot(artworkDragRef.current);
      setSelection(artworkDragRef.current.area);
      setSelectionReady(true);
      artworkDragRef.current = null;
      stopArtworkDragTracking();
      setMovingArtwork(false);
    }
    finishStroke();
  }

  function finishArtworkMove() {
    const drag = artworkDragRef.current;
    if (!drag) return;
    if (drag.dx || drag.dy) {
      undoStackRef.current.push({
        before: drag,
        after: { completed: [...completedRef.current], colors: [...colorsRef.current], progressCompleted: [...progressCompletedRef.current], imageOffset: mapType === "image" ? { ...drag.imageOffset, cellsEdited: true } : { ...imageOffset } },
        target: "drawing",
      });
      if (undoStackRef.current.length > 100) undoStackRef.current.shift();
      redoStackRef.current = [];
    }
    artworkDragRef.current = null;
    stopArtworkDragTracking();
    setMovingArtwork(false);
  }

  function clearProgress() {
    finishStroke();

    if (isGameMode) {
      const before = new Set(progressCompletedRef.current);
      if (!before.size && !progressExtraRef.current) return;
      recordVersionCellChanges([...before], "erase");
      progressCompletedRef.current = new Set();
      setProgressCompleted([]);
      progressExtraRef.current = 0;
      setProgressExtra(0);
      pushHistory(before, new Set(), [], [], "progress");
      return;
    }

    const before =
      new Set(
        completedRef.current
      );

    if (!before.size) return;

    const beforeColors = [
      ...colorsRef.current,
    ];

    const after = new Set();

    setSnapshot({
      completed: [],
      colors:
        mapType === "free"
          ? []
          : colors,
    });

    pushHistory(
      before,
      after,
      beforeColors,
      mapType === "free"
        ? []
        : colors
    );
  }

  function drawCanvas() {
    const c = canvasRef.current;

    if (!c) return;

    const rect =
      c.getBoundingClientRect();

    const dpr =
      Math.min(window.devicePixelRatio || 1, 4096 / Math.max(rect.width, rect.height));
    const physicalPixel = 1 / dpr;

    c.width = Math.max(
      1,
      Math.round(rect.width * dpr)
    );

    c.height = Math.max(
      1,
      Math.round(rect.height * dpr)
    );

    const ctx =
      c.getContext("2d");

    ctx.setTransform(
      dpr,
      0,
      0,
      dpr,
      0,
      0
    );

    // Одинаковый фильтр сохраняет один оттенок пустых клеток в обоих режимах.
    ctx.filter = "none";

    const cw =
      rect.width / cols;

    const ch =
      rect.height / rows;

    const now = performance.now();
    let hasActiveAnimations = false;

    for (
      let i = 0;
      i < actualTotal;
      i++
    ) {
      const r =
        Math.floor(i / cols);

      const col =
        i % cols;

      const x =
        col * cw;

      const y =
        r * ch;

      const drawingActive = completedRef.current.has(i);
      const active =
        isGameMode
          ? progressCompletedRef.current.has(i)
          : drawingActive;

      let fill;

      if (mapType === "free") {
        fill = isGameMode
          ? !drawingActive
            ? "#eeeeee"
            : active
              ? colors[i] || drawColorRef.current
              : "#deded8"
          : active
            ? colors[i] || drawColorRef.current
            : "#eeeeee";
      } else {
        fill = active
          ? colors[i] || "#eeeeee"
          : "#eeeeee";
      }

      const animation = cellAnimationsRef.current.get(i);
      const elapsed = animation === undefined ? 300 : now - animation.startedAt;
      const animationProgress = Math.min(1, elapsed / 260);
      const scale = elapsed < 260
        ? animationProgress < 0.72
          ? 0.86 + animationProgress * 0.31
          : 1.08 - (animationProgress - 0.72) * 0.29
        : 1;

      if (elapsed < 260) hasActiveAnimations = true;

      const isErasing = animation?.mode === "erase" && elapsed < 260;
      const isAppearing = animation?.mode === "draw" && elapsed < 260;

      if (isAppearing) {
        const inactiveFill = mapType === "free" && isGameMode && drawingActive ? "#deded8" : "#eeeeee";
        ctx.fillStyle = inactiveFill;
        ctx.fillRect(x, y, cw + physicalPixel, ch + physicalPixel);
        ctx.globalAlpha = animationProgress;
        ctx.fillStyle = fill;
        ctx.fillRect(x, y, cw + physicalPixel, ch + physicalPixel);
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = fill;
        ctx.fillRect(x, y, cw + physicalPixel, ch + physicalPixel);
      }

      // Поверх основы остаётся мягкий «пульс», поэтому анимация не исчезает.
      if (!isErasing && !isAppearing && elapsed < 260) {
        ctx.globalAlpha = 0.2 * (1 - animationProgress);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(
          x + (cw * (1 - scale)) / 2,
          y + (ch * (1 - scale)) / 2,
          cw * scale + physicalPixel,
          ch * scale + physicalPixel
        );
        ctx.globalAlpha = 1;
      }

      if (
        mapType === "image" &&
        !active &&
        showImage &&
        image
      ) {
        ctx.globalAlpha = 0.35;
        ctx.fillStyle =
          colors[i] ||
          "#dcdcdc";

        ctx.fillRect(
          x,
          y,
          cw + physicalPixel,
          ch + physicalPixel
        );

        ctx.globalAlpha = 1;
      }

      // При стирании фон появляется сразу под курсором, а прежний цвет
      // плавно сжимается поверх него — анимация есть, отставания нет.
      if (isErasing) {
        ctx.globalAlpha = 1 - animationProgress;
        ctx.fillStyle = animation.color || fill;
        ctx.fillRect(x, y, cw + physicalPixel, ch + physicalPixel);
        ctx.globalAlpha = 1;
      }
    }

    ctx.strokeStyle =
      "#d8d4cc";

    ctx.lineWidth = physicalPixel;

    for (
      let r = 0;
      r <= rows;
      r++
    ) {
      const y = (Math.round(r * ch * dpr) + 0.5) / dpr;

      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(
        rect.width,
        y
      );
      ctx.stroke();
    }

    if (hasActiveAnimations) {
      window.cancelAnimationFrame(canvasAnimationFrameRef.current);
      canvasAnimationFrameRef.current = window.requestAnimationFrame(drawCanvas);
    }

    for (
      let col = 0;
      col <= cols;
      col++
    ) {
      const x = (Math.round(col * cw * dpr) + 0.5) / dpr;

      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(
        x,
        rect.height
      );
      ctx.stroke();
    }
  }

  drawCanvasRef.current = drawCanvas;

  useLayoutEffect(() => {
    if (screen !== "editor")
      return;

    drawCanvas();
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      drawCanvas();
      secondFrame = requestAnimationFrame(drawCanvas);
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [
    screen,
    rows,
    cols,
    actualTotal,
    completed,
    progressCompleted,
    colors,
    mapType,
    isGameMode,
    image,
    imageOffset,
    showImage,
    drawColor,
    mapZoom,
    viewportSize,
  ]);

  useEffect(() => {
    const f = () =>
      drawCanvas();

    window.addEventListener(
      "resize",
      f
    );

    return () =>
      window.removeEventListener(
        "resize",
        f
      );
  }, [
    rows,
    cols,
    actualTotal,
    completed,
    progressCompleted,
    colors,
    mapType,
    isGameMode,
    image,
    imageOffset,
    showImage,
    drawColor,
  ]);

  useLayoutEffect(() => {
    if (screen !== "editor" || !viewportRef.current) return;
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    let redrawFrame = 0;
    const syncViewport = () => {
      setViewportSize((previous) => previous.width === viewport.clientWidth && previous.height === viewport.clientHeight ? previous : { width: viewport.clientWidth, height: viewport.clientHeight });
      cancelAnimationFrame(redrawFrame);
      redrawFrame = requestAnimationFrame(() => drawCanvasRef.current?.());
    };
    syncViewport();
    const observer = new ResizeObserver(syncViewport);
    observer.observe(viewport);
    if (canvas) observer.observe(canvas);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(redrawFrame);
    };
  }, [screen, activeMapId, rows, cols, mapZoom]);

  useLayoutEffect(() => {
    const anchor = zoomAnchorRef.current;
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    if (!viewport || !canvas) return;
    if (!anchor) {
      viewport.scrollLeft = (viewport.scrollWidth - viewport.clientWidth) / 2;
      viewport.scrollTop = (viewport.scrollHeight - viewport.clientHeight) / 2;
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const delta = zoomScrollDelta(rect, anchor);
    viewport.scrollLeft += delta.x;
    viewport.scrollTop += delta.y;
    zoomAnchorRef.current = null;
  }, [mapZoom, canvasWidth, canvasHeight, screen, viewportSize]);

  useEffect(() => {
    if (screen !== "editor") return;
    const handleWheel = (e) => {
      const viewport = viewportRef.current;
      const canvas = canvasRef.current;
      if (!e.ctrlKey || !viewport?.contains(e.target) || !canvas) return;
      e.preventDefault();
      e.stopPropagation();
      if (isDrawingRef.current || artworkDragRef.current || selectionGestureRef.current || panGestureRef.current) return;
      const rect = canvas.getBoundingClientRect();
      zoomAnchorRef.current = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height, clientX: e.clientX, clientY: e.clientY };
      setMapZoom((z) => {
        const next = Math.min(4, Math.max(0.5, Number((z + (e.deltaY < 0 ? 0.1 : -0.1)).toFixed(1))));
        if (next === z) zoomAnchorRef.current = null;
        return next;
      });
    };
    window.addEventListener("wheel", handleWheel, { passive: false, capture: true });
    return () => window.removeEventListener("wheel", handleWheel, { capture: true });
  }, [screen]);

  useEffect(() => {
    const heldDirections = new Set();
    let panFrame = 0;
    const pan = () => {
      if (heldDirections.size && !isDrawingRef.current && !artworkDragRef.current && !selectionGestureRef.current && !panGestureRef.current) {
        const horizontal = Number(heldDirections.has("KeyD") || heldDirections.has("ArrowRight")) - Number(heldDirections.has("KeyA") || heldDirections.has("ArrowLeft"));
        const vertical = Number(heldDirections.has("KeyS") || heldDirections.has("ArrowDown")) - Number(heldDirections.has("KeyW") || heldDirections.has("ArrowUp"));
        viewportRef.current?.scrollBy({ left: horizontal * 6, top: vertical * 6, behavior: "instant" });
      }
      panFrame = heldDirections.size ? window.requestAnimationFrame(pan) : 0;
    };
    const f = (e) => {
      if (screen !== "editor" || historyMapId || shareMap || onboardingOpen || showVictory || isCreateOpen || isRenameOpen || isDeleteOpen || isAccountOpen || isLanguageOpen || e.target?.isContentEditable) return;
      if (
        e.target instanceof
          HTMLInputElement ||
        e.target instanceof
          HTMLTextAreaElement ||
        e.target instanceof
          HTMLSelectElement
      ) {
        return;
      }

      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const directionKeys = ["KeyW", "ArrowUp", "KeyS", "ArrowDown", "KeyA", "ArrowLeft", "KeyD", "ArrowRight"];
        if (directionKeys.includes(e.code) && !e.target?.closest('[role="dialog"], [role="listbox"], [role="menu"]')) {
          e.preventDefault();
          heldDirections.add(e.code);
          if (!panFrame) panFrame = window.requestAnimationFrame(pan);
          return;
        }
      }
      const isUndoKey =
        e.code === "KeyZ" ||
        e.key.toLowerCase() === "z";

      const isRedoKey =
        e.code === "KeyY" ||
        e.key.toLowerCase() === "y";

      if ((e.ctrlKey || e.metaKey) && isUndoKey) {
        e.preventDefault();
        e.stopPropagation();

        e.shiftKey
          ? redo()
          : undo();
      } else if ((e.ctrlKey || e.metaKey) && isRedoKey) {
        e.preventDefault();
        e.stopPropagation();
        redo();
      }
    };

    const release = (e) => heldDirections.delete(e.code);
    const releaseAll = () => heldDirections.clear();

    window.addEventListener(
      "keydown",
      f,
      true
    );
    window.addEventListener("keyup", release, true);
    window.addEventListener("blur", releaseAll);

    return () => {
      window.removeEventListener(
        "keydown",
        f,
        true
      );
      window.removeEventListener("keyup", release, true);
      window.removeEventListener("blur", releaseAll);
      window.cancelAnimationFrame(panFrame);
    };
  });

  useEffect(() => {
    const cancel = () => handlePointerCancel();
    const hide = () => { if (document.hidden) cancel(); };
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", hide);
    };
  });

  function processImage(
    dataUrl,
    ratio,
    targetCols = cols,
    targetRows = rows,
    offset = imageOffset,
    targetTotal = actualTotal
  ) {
    const requestId = ++imageProcessingRef.current;
    const img =
      new Image();

    img.onload = () => {
      try {
        if (requestId !== imageProcessingRef.current) return;

        const w = Math.max(1, Number(targetCols) || 1);
        const h = Math.max(1, Number(targetRows) || 1);
        const next = sampleImageColors(img, w, h, offset, targetTotal);

        if (requestId === imageProcessingRef.current) {
          sourceImageRef.current = img;
          setImageOffset(imagePlacement(img.width, img.height, w, h, targetTotal, offset).offset);
          colorsRef.current = next;
          setColors(next);
        }
      } catch (error) {
        console.error("Ошибка обработки изображения:", error);
        if (requestId === imageProcessingRef.current) {
          setSaveStatus("error");
        }
      }
    };

    img.onerror = () => {
      if (requestId === imageProcessingRef.current) {
        console.error("Не удалось загрузить изображение для сетки");
        setSaveStatus("error");
      }
    };

    img.src = dataUrl;
  }

  function handleImageChange(e) {
    const file =
      e.target.files?.[0];

    if (!file) return;

    const reader =
      new FileReader();

    reader.onload = () => {
      const src =
        String(reader.result);

      const img =
        new Image();

      img.onload = () => {
        const ratio = img.width / img.height || 1;
        const dimensions = getGridDimensions(
          requestedTotal,
          ratio,
          gridMode,
          manualRows,
          manualCols
        );

        const offset = {
          x: 0,
          y: 0,
          frame: { left: 0, top: 0, width: dimensions.cols, height: dimensions.rows },
        };
        setImage(src);
        setImageOffset(offset);

        setImageRatio(ratio);

        setMapType("image");
        setShowImage(true);
        setIsGameMode(false);
        progressCompletedRef.current = new Set();
        setProgressCompleted([]);
        progressExtraRef.current = 0;
        setProgressExtra(0);
        setCompletedDirectly([]);
        clearHistory();

        processImage(
          src,
          ratio,
          dimensions.cols,
          dimensions.rows,
          offset,
          dimensions.actualTotal
        );
      };

      img.onerror = () => {
        console.error("Не удалось открыть выбранное изображение");
        setSaveStatus("error");
      };

      img.src = src;
    };

    reader.onerror = () => {
      console.error("Не удалось прочитать выбранный файл");
      setSaveStatus("error");
    };

    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function setCompletedDirectly(
    list
  ) {
    const safe = [
      ...new Set(list),
    ];

    completedRef.current =
      new Set(safe);

    setCompleted(safe);
  }

  function handleMapTypeChange(
    type
  ) {
    if (type === mapType) return;

    finishStroke();
    setSelection(null);
    setSelectionTool(false);

    const currentMap = activeMapRef.current;
    const currentDraft = {
      completed: [...completedRef.current],
      progressCompleted: [...progressCompletedRef.current],
      colors: [...colorsRef.current],
      imageOffset: normalizeImageOffset(imageOffset),
      showImage,
    };
    const modeDrafts = {
      ...(currentMap?.modeDrafts || {}),
      [mapType]: currentDraft,
    };
    const targetDraft = modeDrafts[type];

    if (currentMap) {
      activeMapRef.current = { ...currentMap, modeDrafts };
      setMaps((mapsNow) => mapsNow.map((map) =>
        map.id === activeMapId ? { ...map, modeDrafts } : map
      ));
    }

    setMapType(type);
    setIsGameMode(false);
    progressCompletedRef.current = new Set(targetDraft?.progressCompleted || []);
    setProgressCompleted(targetDraft?.progressCompleted || []);
    progressExtraRef.current = 0;
    setProgressExtra(0);

    setCompletedDirectly(targetDraft?.completed || []);

    const targetColors = targetDraft?.colors || [];
    colorsRef.current = targetColors;
    setColors(targetColors);
    if (targetDraft?.imageOffset) setImageOffset(targetDraft.imageOffset);

    clearHistory();

    if (type === "free") {
      setShowImage(false);
    } else {
      setShowImage(targetDraft?.showImage !== false);
    }
  }

  function resizeGrid(total, mode, nextRows = manualRows, nextCols = manualCols, sides = null) {
    finishStroke();
    setSelection(null);
    const count = Number(total);
    const capacity = mode === "manual" ? Number(nextRows) * Number(nextCols) : count;
    if (count > MAX_CELLS || capacity > MAX_CELLS) {
      setGridError("Лимит — 10000 клеток");
      return;
    }
    if (!Number.isInteger(count) || count < 1 || (mode === "manual" && (!Number.isInteger(Number(nextRows)) || !Number.isInteger(Number(nextCols)) || Number(nextRows) < 1 || Number(nextCols) < 1))) {
      setGridError("Введите целое число от 1 до 10000");
      return;
    }
    setGridError("");
    const before = { rows, cols, actualTotal };
    const after = getGridDimensions(count, imageRatio, mode, nextRows, nextCols);
    const { dx, dy } = sides ? gridResizeShift(before, after, sides.rows, sides.cols) : { dx: 0, dy: 0 };
    const beforeSnapshot = {
      gridMode,
      totalCells,
      manualRows,
      manualCols,
      completed: [...completedRef.current],
      progressCompleted: [...progressCompletedRef.current],
      colors: [...colorsRef.current],
      imageOffset: normalizeImageOffset(imageOffset),
    };
    const canRestoreCroppedCells = mapType === "free" || imageOffset.cellsEdited;
    const shrinking = after.rows < before.rows || after.cols < before.cols;
    let restore = canRestoreCroppedCells ? gridRestoreRef.current : null;
    if (shrinking && !restore) {
      restore = {
        dimensions: before,
        completed: [...completedRef.current],
        progressCompleted: [...progressCompletedRef.current],
        colors: [...colorsRef.current],
        dx: 0,
        dy: 0,
      };
    }
    if (restore) {
      restore.dx += dx;
      restore.dy += dy;
    }
    const restoreBefore = restore?.dimensions || before;
    const restoreDx = restore?.dx ?? dx;
    const restoreDy = restore?.dy ?? dy;
    const nextCompleted = remapCells(restore?.completed || [...completedRef.current], restoreBefore, after, restoreDx, restoreDy);
    setCompletedDirectly(nextCompleted);
    const nextProgress = remapCells(restore?.progressCompleted || [...progressCompletedRef.current], restoreBefore, after, restoreDx, restoreDy);
    progressCompletedRef.current = new Set(nextProgress);
    setProgressCompleted(nextProgress);
    let nextColors = [...colorsRef.current];
    let nextImageOffset = normalizeImageOffset(imageOffset);
    if (mapType === "free" || imageOffset.cellsEdited) {
      nextColors = remapColors(restore?.colors || colorsRef.current, restoreBefore, after, restoreDx, restoreDy);
      colorsRef.current = nextColors;
      setColors(nextColors);
    } else if (image) {
      const offset = {
        x: 0,
        y: 0,
        frame: { left: 0, top: 0, width: after.cols, height: after.rows },
      };
      nextImageOffset = offset;
      setImageOffset(offset);
      if (sourceImageRef.current?.complete) {
        nextColors = sampleImageColors(sourceImageRef.current, after.cols, after.rows, offset, after.actualTotal);
        colorsRef.current = nextColors;
        setColors(nextColors);
      } else {
        processImage(image, imageRatio, after.cols, after.rows, offset, after.actualTotal);
      }
    }
    if (restore) {
      const fullyRestored = after.rows >= restore.dimensions.rows
        && after.cols >= restore.dimensions.cols
        && restore.dx === 0
        && restore.dy === 0;
      gridRestoreRef.current = fullyRestored ? null : restore;
    } else {
      gridRestoreRef.current = null;
    }
    setGridMode(mode);
    setTotalCells(String(count));
    setManualRows(String(after.rows));
    setManualCols(String(after.cols));
    undoStackRef.current.push({
      before: beforeSnapshot,
      after: {
        gridMode: mode,
        totalCells: String(count),
        manualRows: String(after.rows),
        manualCols: String(after.cols),
        completed: nextCompleted,
        progressCompleted: nextProgress,
        colors: nextColors,
        imageOffset: nextImageOffset,
      },
      target: "grid",
    });
    if (undoStackRef.current.length > 100) undoStackRef.current.shift();
    redoStackRef.current = [];
  }

  function handleGridModeChange(mode) {
    if (mode !== gridMode) resizeGrid(requestedTotal, mode, rows, cols);
  }

  function handleManualRowsChange(e) {
    resizeGrid(Number(e.target.value) * Number(manualCols), "manual", e.target.value, manualCols, { rows: rowAddSide, cols: colAddSide });
  }

  function handleManualColsChange(e) {
    resizeGrid(Number(manualRows) * Number(e.target.value), "manual", manualRows, e.target.value, { rows: rowAddSide, cols: colAddSide });
  }

  function handleTotalCellsChange(e) {
    resizeGrid(e.target.value, "auto");
  }

  function fillGameCells() {
    const count = Math.max(1, Number(gameFillCount) || 1);
    const targets = mapType === "image"
      ? Array.from({ length: actualTotal }, (_, index) => index)
      : [...completedRef.current];
    const available = targets.filter(
      (index) => !progressCompletedRef.current.has(index)
    );
    const cells = gameFillRandom
      ? [...available].sort(() => Math.random() - 0.5)
      : available.sort((a, b) => a - b);
    const added = cells.slice(0, Math.min(count, available.length));
    stopProgressSequence();
    const before = new Set(progressCompletedRef.current);
    const after = new Set(before);
    added.forEach((index) => after.add(index));
    if (added.length) {
      pushHistory(before, after, [], [], "progress", added);
      redoStackRef.current = [];
    }
    if (added.length) runProgressSequence(added, after, () => recordPaintedCells(added.length));
    setIsGameFillOpen(false);
  }

  function beginDemoStroke(event, index) {
    event.preventDefault();
    demoPointerRef.current = event.pointerId;
    demoModeRef.current =
      event.button === 2 || heroDemoCells.has(index)
        ? "erase"
        : "draw";
    toggleDemoCell(setHeroDemoCells, index, demoModeRef.current === "erase");
  }

  function continueDemoStroke(event, index) {
    if (demoPointerRef.current !== event.pointerId) return;
    toggleDemoCell(setHeroDemoCells, index, demoModeRef.current === "erase");
  }

  function toggleHeroNoteCell(index, erase) {
    setHeroNoteCells((previous) => {
      const next = new Set(previous);
      if (erase) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function beginHeroNoteStroke(event, index) {
    event.preventDefault();
    heroNotePointerRef.current = event.pointerId;
    // На мини-карте: ЛКМ добавляет, ПКМ стирает.
    // Запоминаем ПКМ-штрих, чтобы браузер не открыл своё меню после выхода за сетку.
    if (event.button === 2) suppressHeroContextMenuRef.current = true;
    heroNoteModeRef.current = event.button === 2 ? "erase" : "draw";
    toggleHeroNoteCell(index, heroNoteModeRef.current === "erase");
  }

  function continueHeroNoteStroke(event, index) {
    if (heroNotePointerRef.current !== event.pointerId) return;
    toggleHeroNoteCell(index, heroNoteModeRef.current === "erase");
  }

  useEffect(() => {
    const stopDemoStroke = () => {
      demoPointerRef.current = null;
      heroNotePointerRef.current = null;
    };
    window.addEventListener("pointerup", stopDemoStroke);
    return () => window.removeEventListener("pointerup", stopDemoStroke);
  }, []);

  function changeTotalCells(
    delta
  ) {
    const current =
      Math.max(
        1,
        Number(
          gridMode === "manual"
            ? actualTotal
            : totalCells
        ) || 1
      );

    const next =
      Math.max(
        1,
        current + delta
      );

    if (gridMode === "auto") {
      handleTotalCellsChange({
        target: {
          value: String(next),
        },
      });
      return;
    }

    updateManualTotalCells(next);
  }

  function updateManualTotalCells(next) {
    const count = Math.max(1, Number(next) || 1);
    const currentRatio = Math.max(
      1 / MAX_CELLS,
      mapType === "image" && image && !imageOffset.cellsEdited
        ? imageRatio
        : cols / Math.max(1, rows)
    );
    const nextCols = Math.max(1, Math.round(Math.sqrt(count * currentRatio)));
    const nextRows = Math.max(1, Math.ceil(count / nextCols));
    resizeGrid(count, "manual", nextRows, nextCols, { rows: rowAddSide, cols: colAddSide });
  }

  function handleManualTotalCellsChange(e) {
    updateManualTotalCells(e.target.value);
  }

  function clearImage() {
    imageProcessingRef.current += 1;
    setImage(null);
    colorsRef.current = [];
    setColors([]);
    setImageRatio(1);
    setCompletedDirectly([]);
    setShowImage(false);
    clearHistory();
  }

  async function saveActiveMap() {
    finishStroke();

    clearTimeout(
      saveTimerRef.current
    );

    const currentMap = buildCurrentMap();
    const map = currentMap ? normalizeMap(addChangeSnapshot(currentMap, pendingVersionSequenceRef.current)) : null;
    pendingVersionSequenceRef.current = [];

    if (!map) return;

    activeMapRef.current = map;

    setMaps((p) =>
      p.map((m) =>
        m.id === map.id
          ? map
          : m
      )
    );

    localStorage.setItem(
      ACTIVE_MAP_KEY,
      map.id
    );

    if (user) {
      const err =
        await remoteSave(map);

      if (err) {
        setSaveStatus("error");

        setTimeout(
          () =>
            setSaveStatus(""),
          1800
        );

        return;
      }
    }

    setSaveStatus("saved");

    setTimeout(
      () =>
        setSaveStatus(""),
      1800
    );
  }

  function closeModal(kind) {
    if (closingModal) return;
    setClosingModal(kind);
    window.setTimeout(() => {
      if (kind === "create") setIsCreateOpen(false);
      if (kind === "rename") setIsRenameOpen(false);
      if (kind === "feedback") setIsFeedbackOpen(false);
      if (kind === "download") setDownloadChoice(null);
      if (kind === "delete") {
        setIsDeleteOpen(false);
        setMapToDelete(null);
      }
      setClosingModal("");
    }, 260);
  }

  function closeSketchSubmissionModal(afterClose) {
    if (isSketchSubmissionClosing) return;
    setIsSketchSubmissionClosing(true);
    window.setTimeout(() => {
      setIsSketchSubmissionOpen(false);
      setIsSketchSubmissionClosing(false);
      afterClose?.();
    }, 260);
  }

  function openCreateModal() {
    setClosingModal("");
    setNewMapName("");
    setNewMapDescription("");
    setNewMapCategory("Личное");
    setNewMapDeadline("");
    setNewMapPlanMode("balanced");
    setNewCategoryDraft("");
    setNewMapType("free");
    setNewMapGridMode("auto");
    setNewMapCells("500");
    setNewMapRows("20");
    setNewMapCols("25");
    setIsCreateOpen(true);
  }

  function changeNewMapCells(delta) {
    setNewMapCells((previous) => String(Math.max(1, (Number(previous) || 1) + delta)));
  }

  function stopMapCellsHold() {
    window.clearTimeout(mapCellsHoldRef.current.delay);
    window.clearInterval(mapCellsHoldRef.current.interval);
    mapCellsHoldRef.current = { delay: null, interval: null };
  }

  function startMapCellsHold(delta) {
    stopMapCellsHold();
    changeNewMapCells(delta);
    mapCellsHoldRef.current.delay = window.setTimeout(() => {
      mapCellsHoldRef.current.interval = window.setInterval(() => changeNewMapCells(delta), 70);
    }, 260);
  }

  function addCustomCategory(target) {
    const category = newCategoryDraft.trim().slice(0, 36);
    if (!category) return;
    setCustomCategories((previous) => previous.includes(category) || MAP_CATEGORIES.includes(category) ? previous : [...previous, category]);
    if (target === "rename") setRenameCategory(category);
    else if (target === "library") {
      setIsLibraryCategoryAdding(false);
    } else setNewMapCategory(category);
    setNewCategoryDraft("");
  }

  async function createMap() {
    if (newMapInvalid) return;
    const map = normalizeMap({
      id: createMapId(),
      order: Math.max(0, ...maps.map((map) => map.order || 0)) + 1,
      name:
        newMapName.trim() ||
        "Новая карта",
      description: newMapDescription.trim(),
      category: newMapCategory === "__custom__" ? "Личное" : newMapCategory,
      deadline: newMapDeadline,
      planMode: newMapPlanMode,
      createdAt: new Date().toISOString(),
      mapType: newMapType,
      gridMode:
        newMapGridMode,
      totalCells: String(newMapCount),
      manualRows: String(
        Math.max(
          1,
          Number(newMapRows) ||
            1
        )
      ),
      manualCols: String(
        Math.max(
          1,
          Number(newMapCols) ||
            1
        )
      ),
      showImage:
        newMapType === "image",
    });

    let use = map;

    if (user) {
      const {
        data,
        error,
      } = await supabase
        .from("maps")
        .upsert(
          mapToSupabaseRow(
            map,
            user.id
          ),
          {
            onConflict: "id",
          }
        )
        .select(
          "id,user_id,name,data,created_at,updated_at"
        )
        .single();

      if (error) {
        console.error(error);
        return;
      }

      if (data) {
        use =
          mapFromSupabaseRow(
            data
          );
      }
    }

    setMaps((p) => [
      ...p,
      use,
    ]);

    recordAnalytics("map_created");
    recordAnalytics("cells_created", { value: Number(use.totalCells) || newMapCount });

    setActiveMapId(use.id);

    openMap(use);

    setClosingModal("create");
    window.setTimeout(() => {
      setIsCreateOpen(false);
      setClosingModal("");
      setScreen("editor");
      localStorage.setItem(ACTIVE_MAP_KEY, use.id);
    }, 260);
  }

  function openMap(map) {
    finishStroke();
    gridRestoreRef.current = null;
    setSelection(null);
    setSelectionTool(false);

    const m =
      normalizeMap(map);
    activeMapRef.current = m;
    setShowVictory(false);

    gameVictoryBaselineMapRef.current = m.id;
    setActiveMapId(m.id);
    setMapType(m.mapType);
    setGridMode(m.gridMode);
    setCompletedDirectly(
      m.completed
    );
    progressCompletedRef.current = new Set(m.progressCompleted);
    setProgressCompleted(m.progressCompleted);
    progressExtraRef.current = m.progressExtra;
    setProgressExtra(m.progressExtra);
    setIsGameMode(m.isGameMode);

    imageProcessingRef.current += 1;
    setImage(m.image);
    setImageOffset(m.imageOffset);
    setGridError("");
    sourceImageRef.current = null;
    if (m.image) {
      const source = new Image();
      const requestId = imageProcessingRef.current;
      source.onload = () => {
        if (requestId !== imageProcessingRef.current) return;
        sourceImageRef.current = source;
        if (m.mapType === "image" && !m.imageOffset.cellsEdited) {
          const dimensions = getGridDimensions(m.totalCells, m.imageRatio, m.gridMode, m.manualRows, m.manualCols);
          const offset = m.imageOffset.frame
            ? m.imageOffset
            : { x: 0, y: 0, frame: { left: 0, top: 0, width: dimensions.cols, height: dimensions.rows } };
          const nextColors = sampleImageColors(source, dimensions.cols, dimensions.rows, offset, dimensions.actualTotal);
          colorsRef.current = nextColors;
          setColors(nextColors);
          setImageOffset(offset);
        }
      };
      source.src = m.image;
    }

    colorsRef.current =
      m.colors;

    setColors(m.colors);

    setImageRatio(
      m.imageRatio
    );

    selectDrawColor(
      m.drawColor
    );

    setCustomColors(
      m.customColors.filter(
        (color) => color.toLowerCase() !== "#ff0000"
      )
    );

    setTotalCells(
      m.totalCells
    );

    setManualRows(
      m.manualRows
    );

    setManualCols(
      m.manualCols
    );

    setShowImage(
      m.showImage
    );

    setDescription(
      m.description
    );

    activityLogRef.current = m.activityLog;
    setActivityLog(m.activityLog);

    clearHistory();

    setMapZoom(1);

    localStorage.setItem(
      ACTIVE_MAP_KEY,
      m.id
    );
  }

  function openRenameModal(
    map
  ) {
    setClosingModal("");
    setRenameValue(
      map.name || ""
    );
    setRenameDescription(map.description || "");
    setRenameCategory(map.category || "Личное");
    setRenameDeadline(map.deadline || "");
    setRenamePlanMode(PLAN_MODES[map.planMode] ? map.planMode : "balanced");
    setRenamePausedUntil(map.planPausedUntil || "");
    setNewCategoryDraft("");

    setRenameMapId(map.id);
    setIsRenameOpen(true);
  }

  async function saveRename() {
    const name =
      renameValue.trim();

    if (
      !name ||
      !renameMapId
    ) {
      return;
    }

    const old =
      maps.find(
        (m) =>
          m.id === renameMapId
      );

    if (!old) return;

    const renamed =
      normalizeMap({
        ...old,
        name,
        description: renameDescription.trim(),
        category: renameCategory === "__custom__" ? old.category || "Личное" : renameCategory,
        deadline: renameDeadline,
        planMode: renamePlanMode,
        planPausedUntil: renamePlanMode === "paused" ? renamePausedUntil : "",
      });

    setMaps((p) =>
      p.map((m) =>
        m.id === renameMapId
          ? renamed
          : m
      )
    );

    if (renameMapId === activeMapId) {
      setDescription(renameDescription.trim());
    }

    if (user) {
      const err =
        await remoteSave(
          renamed
        );

      if (err) {
        setMaps((p) =>
          p.map((m) =>
            m.id === renameMapId
              ? old
              : m
          )
        );

        return;
      }
    }

    setIsRenameOpen(false);
    setRenameValue("");
    setRenameDescription("");
    setRenameCategory("Личное");
    setRenameDeadline("");
    setRenamePlanMode("balanced");
    setRenamePausedUntil("");
    setRenameMapId(null);
  }

  function openDeleteModal(
    map
  ) {
    setClosingModal("");
    setMapToDelete(map);
    setIsDeleteOpen(true);
  }

  function prepareCardLayoutTransition(type, id = null) {
    cardPositionsRef.current = new Map(
      [...document.querySelectorAll("[data-map-id]")].map((element) => [
        element.dataset.mapId,
        element.getBoundingClientRect(),
      ])
    );
    setCardSettling({ id, type });
  }

  function scrollToRestoredMap(id) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const card = document.querySelector(`[data-map-id="${CSS.escape(id)}"]`);
      if (!card) return;
      const bounds = card.getBoundingClientRect();
      if (bounds.bottom > window.innerHeight - 24 || bounds.top < 24) {
        card.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }));
  }

  function changeMapColumns(columns) {
    if (columns === mapColumns) return;
    prepareCardLayoutTransition("layout");
    setMapColumns(columns);
    if (user?.id) localStorage.setItem(`${MAPS_COLUMNS_KEY}:${user.id}`, String(columns));
  }

  async function confirmDeleteMap() {
    if (!mapToDelete || deletingIdsRef.current.has(mapToDelete.id)) return;
    const deletedMap = normalizeMap(mapToDelete);
    const id = deletedMap.id;
    const deletedCard = document.querySelector(`[data-map-id="${CSS.escape(id)}"]`);
    const grid = deletedCard?.parentElement;
    const gridCards = grid ? [...grid.querySelectorAll("[data-map-id]")] : [];
    const isBottomRow = deletedCard
      ? !gridCards.some((card) => card !== deletedCard && card.offsetTop > deletedCard.offsetTop)
      : false;
    const collapseHeight = isBottomRow && deletedCard
      ? deletedCard.offsetHeight + (Number.parseFloat(getComputedStyle(grid).rowGap) || 0)
      : 0;
    if (collapseHeight) setDeleteCollapseHeight(collapseHeight);
    deletingIdsRef.current.add(id);
    setDeletingIds((ids) => [...ids, id]);
    setMapActionError("");
    setIsDeleteOpen(false);
    setMapToDelete(null);
    if (id === activeMapId) {
      clearTimeout(saveTimerRef.current);
      setActiveMapId(null);
      localStorage.removeItem(ACTIVE_MAP_KEY);
    }
    setScreen("maps");
    const pending = { map: deletedMap, deadline: Date.now() + 5000 };
    pendingDeletesRef.current = [pending, ...pendingDeletesRef.current];
    setPendingDeletes([...pendingDeletesRef.current]);
    setDeleteCountdownNow(Date.now());
    const timer = window.setTimeout(() => void finalizePendingDelete(id), 5000);
    pendingDeleteTimersRef.current.set(id, timer);
    window.setTimeout(() => {
      if (!pendingDeletesRef.current.some((entry) => entry.map.id === id)) return;
      prepareCardLayoutTransition("delete");
      setMaps((current) => current.filter((map) => map.id !== id));
      deletingIdsRef.current.delete(id);
      setDeletingIds((ids) => ids.filter((value) => value !== id));
      if (collapseHeight) {
        requestAnimationFrame(() => requestAnimationFrame(() => setDeleteCollapseHeight(0)));
      }
    }, 360);
  }

  async function restoreLastDeletedMap() {
    if (restoringDeletedMapRef.current) return;
    const pending = pendingDeletesRef.current[0];
    const deleted = pending?.map || deletedMapsRef.current[0];
    if (!deleted) return;
    restoringDeletedMapRef.current = true;
    if (pending) {
      window.clearTimeout(pendingDeleteTimersRef.current.get(deleted.id));
      pendingDeleteTimersRef.current.delete(deleted.id);
      pendingDeletesRef.current = pendingDeletesRef.current.filter((entry) => entry.map.id !== deleted.id);
      setPendingDeletes([...pendingDeletesRef.current]);
    } else {
      deletedMapsRef.current = deletedMapsRef.current.slice(1);
    }
    setMapActionError("");
    try {
      if (user && !pending) {
        const { error } = await supabase.from("maps").upsert(mapToSupabaseRow(deleted, user.id), { onConflict: "id" });
        if (error) throw error;
      }
      prepareCardLayoutTransition("restore", deleted.id);
      setMaps((current) => [...current.filter((map) => map.id !== deleted.id), deleted]);
      deletingIdsRef.current.delete(deleted.id);
      setDeletingIds((ids) => ids.filter((id) => id !== deleted.id));
      setRestoredMapIds((ids) => [...ids, deleted.id]);
      window.setTimeout(() => setRestoredMapIds((ids) => ids.filter((id) => id !== deleted.id)), 620);
      scrollToRestoredMap(deleted.id);
    } catch (error) {
      console.error("Не удалось восстановить карту:", error);
      if (!pending) deletedMapsRef.current = [deleted, ...deletedMapsRef.current].slice(0, 3);
      setMapActionError("Не удалось восстановить карту. Проверьте соединение и повторите Ctrl+Z.");
    } finally {
      restoringDeletedMapRef.current = false;
    }
  }

  async function finalizePendingDelete(id) {
    const pending = pendingDeletesRef.current.find((entry) => entry.map.id === id);
    if (!pending) return;
    pendingDeleteTimersRef.current.delete(id);
    pendingDeletesRef.current = pendingDeletesRef.current.filter((entry) => entry.map.id !== id);
    setPendingDeletes([...pendingDeletesRef.current]);
    setMaps((current) => current.filter((map) => map.id !== id));
    deletedMapsRef.current = [pending.map, ...deletedMapsRef.current].slice(0, 3);
    try {
      const remove = async () => {
        if (!user) return;
        const { error } = await supabase.from("maps").delete().eq("id", id).eq("user_id", user.id);
        if (error) throw error;
        await discardPendingMap(user.id, id).catch(() => null);
      };
      const request = remoteSaveQueueRef.current.then(remove, remove);
      remoteSaveQueueRef.current = request.catch(() => null);
      await request;
      recordAnalytics("map_deleted");
    } catch (error) {
      console.error("Не удалось удалить карту:", error);
      deletedMapsRef.current = deletedMapsRef.current.filter((map) => map.id !== id);
      prepareCardLayoutTransition("restore", id);
      setMaps((current) => [...current.filter((map) => map.id !== id), pending.map]);
      setRestoredMapIds((ids) => [...ids, id]);
      window.setTimeout(() => setRestoredMapIds((ids) => ids.filter((value) => value !== id)), 620);
      scrollToRestoredMap(id);
      setMapActionError("Не удалось удалить карту. Она возвращена в список.");
    }
  }

  function reorderCardsToIndex(id, targetIndex) {
    const ordered = [...maps].sort((a, b) => a.order - b.order);
    const visible = ordered.filter((map) => mapCategoryFilter === "Все" || map.category === mapCategoryFilter);
    const from = visible.findIndex((map) => map.id === id);
    if (from < 0) return;
    const safeTargetIndex = Math.max(0, Math.min(visible.length - 1, targetIndex));
    if (from === safeTargetIndex) return;
    prepareCardLayoutTransition("reorder", id);
    const rearranged = [...visible];
    [rearranged[from], rearranged[safeTargetIndex]] = [rearranged[safeTargetIndex], rearranged[from]];
    let visibleIndex = 0;
    const next = ordered.map((map) => mapCategoryFilter === "Все" || map.category === mapCategoryFilter ? rearranged[visibleIndex++] : map)
      .map((map, order) => ({ ...map, order }));
    const active = next.find((map) => map.id === activeMapId);
    if (active) activeMapRef.current = active;
    setMaps(next);
    saveMapsLocally(next);
    if (user) {
      Promise.all(next.map((map) => remoteSave(map))).then((errors) => {
        if (errors.some(Boolean)) setMapActionError("Порядок сохранён на этом устройстве. Не удалось синхронизировать его с сервером.");
      });
    }
  }

  function reorderCards(id, targetId) {
    const visible = [...maps].sort((a, b) => a.order - b.order).filter((map) => mapCategoryFilter === "Все" || map.category === mapCategoryFilter);
    const targetIndex = visible.findIndex((map) => map.id === targetId);
    if (targetIndex >= 0) reorderCardsToIndex(id, targetIndex);
  }

  function reorderCategories(id, targetId) {
    if (id === targetId) return;
    const next = [...allCategories];
    const from = next.indexOf(id), to = targetId === "Все" ? 0 : next.indexOf(targetId);
    if (from < 0 || to < 0) return;
    next.splice(to, 0, ...next.splice(from, 1));
    setCategoryOrder(next);
  }

  function beginCategoryDrag(event, category) {
    if (event.button !== 0) return;
    const element = event.currentTarget;
    const slots = [...document.querySelectorAll(".maps-filter [data-category]")]
      .filter((node) => node.dataset.category !== "Все")
      .map((node, index) => ({ category: node.dataset.category, index, rect: node.getBoundingClientRect() }));
    const from = slots.findIndex((slot) => slot.category === category);
    const sourceRect = slots[from]?.rect || element.getBoundingClientRect();
    const drag = {
      category,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      dx: 0,
      dy: 0,
      width: element.offsetWidth,
      target: category,
      from,
      targetIndex: from,
      sourceRect,
      slots,
      active: false,
    };
    categoryDragRef.current = drag;
    suppressCategoryClick.current = false;
    const move = (e) => {
      if (e.pointerId !== drag.pointerId) return;
      if (!drag.active) {
        if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) <= 6) return;
        drag.active = true;
        suppressCategoryClick.current = true;
        element.setPointerCapture(drag.pointerId);
      }
      e.preventDefault();
      drag.dx = e.clientX - drag.x;
      drag.dy = e.clientY - drag.y;
      const centerX = drag.sourceRect.left + drag.sourceRect.width / 2 + drag.dx;
      const centerY = drag.sourceRect.top + drag.sourceRect.height / 2 + drag.dy;
      const target = drag.slots.reduce((nearest, slot) => {
        const rect = slot.rect;
        const distance = Math.hypot(
          centerX - (rect.left + rect.width / 2),
          centerY - (rect.top + rect.height / 2)
        );
        return !nearest || distance < nearest.distance ? { slot, distance } : nearest;
      }, null)?.slot;
      if (target) {
        drag.target = target.category;
        drag.targetIndex = target.index;
      }
      setCategoryDrag({ ...drag });
    };
    const finish = (e) => {
      if (e.pointerId !== drag.pointerId) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      const categoryElements = drag.active
        ? [...document.querySelectorAll(".maps-filter [data-category]")]
        : [];
      const releaseRects = new Map(categoryElements.map((node) => [node.dataset.category, node.getBoundingClientRect()]));
      categoryElements.forEach((node) => { node.style.transition = "none"; });
      if (drag.active && e.type !== "pointercancel") reorderCategories(category, drag.target);
      if (element.hasPointerCapture(drag.pointerId)) element.releasePointerCapture(drag.pointerId);
      categoryDragRef.current = null;
      setCategoryDrag(null);
      if (releaseRects.size) {
        window.requestAnimationFrame(() => {
          [...document.querySelectorAll(".maps-filter [data-category]")].forEach((settled) => {
            const releaseRect = releaseRects.get(settled.dataset.category);
            if (!releaseRect) return;
            const finalRect = settled.getBoundingClientRect();
            const offsetX = releaseRect.left - finalRect.left;
            const offsetY = releaseRect.top - finalRect.top;
            if (Math.abs(offsetX) < 0.5 && Math.abs(offsetY) < 0.5) {
              settled.style.removeProperty("transition");
              return;
            }
            const animation = settled.animate?.(
              [
                { transform: `translate3d(${offsetX}px,${offsetY}px,0)` },
                { transform: "translate3d(0,0,0)" },
              ],
              { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" }
            );
            if (animation) animation.onfinish = () => settled.style.removeProperty("transition");
            else settled.style.removeProperty("transition");
          });
        });
      }
      window.setTimeout(() => { suppressCategoryClick.current = false; }, 0);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  function beginCardDrag(event, id) {
    if (event.button !== 0 || event.target.closest("button, input, textarea, a") || deletingIdsRef.current.has(id)) return;
    cardAnimationsRef.current.forEach((animation) => animation.cancel());
    cardAnimationsRef.current = [];
    setCardSettling(null);
    const element = event.currentTarget;
    const visible = [...maps].sort((a, b) => a.order - b.order).filter((map) => mapCategoryFilter === "Все" || map.category === mapCategoryFilter);
    const drag = { id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, scrollX: window.scrollX, scrollY: window.scrollY, dx: 0, dy: 0, targetIndex: visible.findIndex((map) => map.id === id), dropRect: null, active: false };
    cardDragRef.current = drag;
    suppressCardClick.current = false;
    const pointer = { x: event.clientX, y: event.clientY };
    const update = () => {
      if (!drag.active) return;
      const previous = { dx: drag.dx, dy: drag.dy, targetIndex: drag.targetIndex };
      Object.assign(drag, cardDragPosition(drag, pointer, { x: window.scrollX, y: window.scrollY }));
      const list = element.closest(".maps-list");
      const listRect = list.getBoundingClientRect();
      const cards = [...list.querySelectorAll("[data-map-id]")];
      // Use actual layout slots, not the dragged card's height to estimate rows.
      const slots = cards.map((card) => ({ left: card.offsetLeft, top: card.offsetTop, width: card.offsetWidth, height: card.offsetHeight }));
      drag.targetIndex = cardDropIndex({ x: pointer.x - listRect.left, y: pointer.y - listRect.top }, slots);
      drag.dropRect = slots[drag.targetIndex];
      if (previous.dx !== drag.dx || previous.dy !== drag.dy || previous.targetIndex !== drag.targetIndex || !drag.painted) {
        drag.painted = true;
        // Paint synchronously on scroll so React cannot leave the card one scroll behind.
        element.style.transform = `translate3d(${drag.dx}px, ${drag.dy}px, 0) rotate(1deg)`;
        setCardDrag({ ...drag });
      }
    };
    let previousFrame = 0;
    const follow = (now) => {
      if (cardDragRef.current !== drag || !drag.active) return;
      const elapsed = Math.min(32, previousFrame ? now - previousFrame : 0);
      previousFrame = now;
      const direction = pointer.y < 65 ? -1 : pointer.y > window.innerHeight - 65 ? 1 : 0;
      if (direction) window.scrollBy({ top: direction * elapsed * 0.6, behavior: "instant" });
      update();
      drag.frame = window.requestAnimationFrame(follow);
    };
    const activate = () => {
      if (cardDragRef.current !== drag || drag.active) return;
      drag.active = true;
      suppressCardClick.current = true;
      element.setPointerCapture(drag.pointerId);
      update();
      drag.frame = window.requestAnimationFrame(follow);
    };
    const timer = window.setTimeout(activate, 220);
    const move = (e) => {
      if (e.pointerId !== drag.pointerId) return;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      if (!drag.active) {
        if (Math.hypot(pointer.x - drag.x, pointer.y - drag.y) <= 8) return;
        window.clearTimeout(timer);
        if (e.pointerType === "touch") return;
        activate();
      }
      e.preventDefault();
      update();
    };
    const finish = (e) => {
      if (e.pointerId !== drag.pointerId) return;
      if (e.type !== "pointercancel") { pointer.x = e.clientX; pointer.y = e.clientY; update(); }
      window.clearTimeout(timer);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      if (drag.frame) window.cancelAnimationFrame(drag.frame);
      if (drag.active && e.type !== "pointercancel") {
        reorderCardsToIndex(id, drag.targetIndex);
      }
      if (element.hasPointerCapture(drag.pointerId)) element.releasePointerCapture(drag.pointerId);
      cardDragRef.current = null;
      setCardDrag(null);
      window.setTimeout(() => { suppressCardClick.current = false; }, 0);
    };
    window.addEventListener("scroll", update, { capture: true, passive: true });
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  function saveMapPng(name, dimensions, filledCells, cellColors, withGrid) {
    const cellSize = Math.max(4, Math.min(24, Math.floor(4096 / Math.max(dimensions.cols, dimensions.rows))));
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.cols * cellSize;
    canvas.height = dimensions.rows * cellSize;
    const ctx = canvas.getContext("2d");
    const filled = new Set(filledCells || []);
    ctx.fillStyle = "#eeeeee";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < dimensions.actualTotal; i++) {
      if (filled.has(i)) {
        ctx.fillStyle = normalizeHexColor(cellColors?.[i]) === UTILITY_COLOR
          ? "#eeeeee"
          : cellColors?.[i] || "#32624f";
        ctx.fillRect((i % dimensions.cols) * cellSize, Math.floor(i / dimensions.cols) * cellSize, cellSize, cellSize);
      }
      if (withGrid) {
        ctx.strokeStyle = "#d8d4cc";
        ctx.strokeRect((i % dimensions.cols) * cellSize + 0.5, Math.floor(i / dimensions.cols) * cellSize + 0.5, cellSize, cellSize);
      }
    }
    const link = document.createElement("a");
    const filename = (name || "MM-map").replace(/[\\/:*?"<>|]/g, "").trim() || "MM-map";
    link.download = `${filename}${withGrid ? "-с-сеткой" : ""}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  function downloadMap(withGrid) {
    const filled = isGameMode ? [...progressCompletedRef.current] : [...completedRef.current];
    saveMapPng(activeMap?.name, { rows, cols, actualTotal }, filled, colorsRef.current, withGrid);
  }

  function downloadStoredMap(map, withGrid) {
    const dimensions = getGridDimensions(
      Math.max(1, Number(map.totalCells) || 1),
      map.imageRatio || 1,
      map.gridMode,
      map.manualRows,
      map.manualCols
    );
    const filled = map.isGameMode ? map.progressCompleted : map.completed;
    saveMapPng(map.name, dimensions, filled, map.colors, withGrid);
  }

  async function submitFeedback(event) {
    event.preventDefault();
    if (!feedbackMessage.trim() || !user) return;
    const attachmentsSize = feedbackFiles.reduce((total, file) => total + file.size, 0);
    if (attachmentsSize > FEEDBACK_MAX_BYTES) {
      setFeedbackStatus("files-too-large");
      return;
    }
    setFeedbackStatus("sending");
    try {
      const formData = new FormData();
      formData.append("_subject", `Map Method — ${feedbackKind}`);
      formData.append("Тип", feedbackKind);
      formData.append("Сообщение", feedbackMessage.trim());
      formData.append("Email для ответа", feedbackEmail.trim() || "Не указан");
      if (feedbackEmail.trim()) formData.append("email", feedbackEmail.trim());
      formData.append("_captcha", "false");
      const attachments = [];
      for (const file of feedbackFiles) {
        if (!user) throw new Error("auth");
        const extension = file.name.includes(".") ? `.${file.name.split(".").pop().replace(/[^a-zA-Z0-9]/g, "")}` : "";
        const path = `${user.id}/${Date.now()}-${crypto.randomUUID()}${extension}`;
        const { error: uploadError } = await supabase.storage.from(FEEDBACK_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
        const { data: signedFile } = await supabase.storage.from(FEEDBACK_BUCKET).createSignedUrl(path, 60 * 60 * 24 * 30);
        attachments.push({ name: file.name, path, url: signedFile?.signedUrl || "" });
      }
      const attachmentLinks = attachments.map((attachment) => attachment.url).filter(Boolean);
      if (attachmentLinks.length) formData.append("Вложения", attachmentLinks.join("\n"));
      const { error: inboxError } = await supabase.from(FEEDBACK_TABLE).insert({
        sender_id: user.id,
        sender_email: user.email || "",
        reply_email: feedbackEmail.trim() || null,
        kind: feedbackKind,
        message: feedbackMessage.trim(),
        attachments,
      });
      if (inboxError) throw inboxError;
      recordAnalytics("feedback_sent");
      await fetch("https://formsubmit.co/ajax/majurx64@yandex.ru", {
        method: "POST",
        headers: { Accept: "application/json" },
        body: formData,
      }).catch(() => null);
      setFeedbackMessage("");
      setFeedbackFiles([]);
      if (feedbackFileInputRef.current) feedbackFileInputRef.current.value = "";
      setFeedbackStatus("");
      setClosingModal("feedback");
      window.setTimeout(() => {
        setIsFeedbackOpen(false);
        setClosingModal("");
        setIsFeedbackThanksClosing(false);
        setShowFeedbackThanks(true);
        window.clearTimeout(feedbackThanksAutoTimerRef.current);
        feedbackThanksAutoTimerRef.current = window.setTimeout(closeFeedbackThanks, 2200);
      }, 260);
    } catch (error) {
      console.error("Не удалось отправить обращение:", error);
      setFeedbackStatus("error");
    }
  }

  async function submitLibrarySketch(event) {
    event.preventDefault();
    const sources = maps.filter((map) => sketchSubmissionMapIds.includes(map.id));
    if (!sources.length || !user) return;
    setSketchSubmissionStatus("sending");
    const submittedMaps = sources.map((source) => {
      const dimensions = getGridDimensions(source.totalCells, source.imageRatio, source.gridMode, source.manualRows, source.manualCols);
      return normalizeMap({
        ...source,
        id: createMapId(),
        mapType: "free",
        image: null,
        showImage: false,
        completed: source.mapType === "image" ? Array.from({ length: dimensions.actualTotal }, (_, index) => index) : source.completed,
        progressCompleted: [],
        progressExtra: 0,
        activityLog: [],
        modeDrafts: {},
      });
    });
    const { error } = await supabase.from(FEEDBACK_TABLE).insert({
      sender_id: user.id,
      sender_email: user.email || "",
      reply_email: user.email || null,
      kind: "Эскиз в общую библиотеку",
      message: sketchSubmissionNote.trim() || (submittedMaps.length > 1
        ? `Предлагаю добавить ${submittedMaps.length} эскиза в общую библиотеку.`
        : `Предлагаю добавить эскиз «${submittedMaps[0].name}» в общую библиотеку.`),
      attachments: [],
      submission_data: { maps: submittedMaps },
    });
    if (error) {
      setSketchSubmissionStatus("error");
      return;
    }
    recordAnalytics("library_submission", { value: sources.length });
    setSketchSubmissionStatus("sent");
    window.setTimeout(() => closeSketchSubmissionModal(() => {
      setSketchSubmissionStatus("");
      setSketchSubmissionNote("");
      setSketchSubmissionMapIds([]);
      setShowFeedbackThanks(true);
      feedbackThanksAutoTimerRef.current = window.setTimeout(closeFeedbackThanks, 2200);
    }), 500);
  }

  async function approveLibrarySubmission(message, submissionIndex = 0) {
    if (!user || !isLibraryOwner || !message.submission_data) return;
    const groupedMaps = Array.isArray(message.submission_data.maps) ? message.submission_data.maps : null;
    const selectedSubmission = groupedMaps ? groupedMaps[submissionIndex] : message.submission_data;
    if (!selectedSubmission || selectedSubmission.approved_library_id) return;
    setFeedbackAdminState((state) => ({ ...state, [message.id]: "saving" }));
    const item = normalizeMap({
      ...selectedSubmission,
      id: `public-${createMapId()}`,
      progressCompleted: [],
      progressExtra: 0,
      activityLog: [],
      modeDrafts: {},
    });
    const { error: libraryError } = await supabase.from(PUBLIC_LIBRARY_TABLE).insert({
      id: item.id,
      owner_id: user.id,
      name: item.name,
      data: item,
    });
    if (libraryError) {
      setFeedbackAdminState((state) => ({ ...state, [message.id]: "error" }));
      return;
    }
    const submissionData = groupedMaps
      ? {
          ...message.submission_data,
          maps: groupedMaps.map((map, index) => index === submissionIndex ? { ...map, approved_library_id: item.id } : map),
        }
      : { ...message.submission_data, approved_library_id: item.id };
    const allApproved = Array.isArray(submissionData.maps)
      ? submissionData.maps.every((map) => map.approved_library_id)
      : Boolean(submissionData.approved_library_id);
    const nextWorkStatus = allApproved ? "done" : (message.work_status || "new");
    const { error } = await supabase.from(FEEDBACK_TABLE).update({ submission_data: submissionData, work_status: nextWorkStatus }).eq("id", message.id);
    if (error) {
      setFeedbackAdminState((state) => ({ ...state, [message.id]: "error" }));
      return;
    }
    setPublicLibrary((current) => [...current, { ...item, publicLibraryOwnerId: user.id }]);
    setFeedbackMessages((current) => current.map((entry) => entry.id === message.id ? { ...entry, submission_data: submissionData, work_status: nextWorkStatus } : entry));
    setFeedbackAdminState((state) => ({ ...state, [message.id]: "saved" }));
  }

  function editLibrarySubmission(message, submissionIndex = 0) {
    const groupedMaps = Array.isArray(message.submission_data?.maps) ? message.submission_data.maps : null;
    const source = groupedMaps ? groupedMaps[submissionIndex] : message.submission_data;
    if (!source || source.approved_library_id) return;
    const draft = normalizeMap({ ...source, id: createMapId(), progressCompleted: [] });
    setMaps((current) => [...current, draft]);
    setSubmissionEditContext({
      messageId: message.id,
      submissionIndex,
      draftId: draft.id,
      originalId: source.id,
      grouped: Boolean(groupedMaps),
      originScrollY: Math.max(window.scrollY, document.documentElement.scrollTop, document.body.scrollTop),
    });
    setSubmissionEditStatus("");
    setActiveMapId(draft.id);
    openMap(draft);
    setScreen("editor");
    localStorage.setItem(ACTIVE_MAP_KEY, draft.id);
  }

  async function finishSubmissionEditing(action) {
    if (!submissionEditContext) return;
    const context = submissionEditContext;
    if (action) {
      const message = feedbackMessages.find((entry) => entry.id === context.messageId);
      const currentMap = buildCurrentMap();
      if (!message || !currentMap) return;
      setSubmissionEditStatus("saving");
      const editedSubmission = normalizeMap({
        ...currentMap,
        id: context.originalId,
        mapType: "free",
        image: null,
        showImage: false,
        progressCompleted: [],
        progressExtra: 0,
        activityLog: [],
        modeDrafts: {},
      });
      let savedSubmission = editedSubmission;
      let libraryItem = null;
      if (action === "publish") {
        libraryItem = normalizeMap({
          ...editedSubmission,
          id: `public-${createMapId()}`,
        });
        const { error: libraryError } = await supabase.from(PUBLIC_LIBRARY_TABLE).insert({
          id: libraryItem.id,
          owner_id: user.id,
          name: libraryItem.name,
          data: libraryItem,
        });
        if (libraryError) {
          setSubmissionEditStatus("error");
          return;
        }
        savedSubmission = { ...editedSubmission, approved_library_id: libraryItem.id };
      }
      const submissionData = context.grouped
        ? {
            ...message.submission_data,
            maps: message.submission_data.maps.map((map, index) => index === context.submissionIndex ? savedSubmission : map),
          }
        : savedSubmission;
      const allApproved = Array.isArray(submissionData.maps)
        ? submissionData.maps.every((map) => map.approved_library_id)
        : Boolean(submissionData.approved_library_id);
      const nextWorkStatus = action === "publish" && allApproved ? "done" : (message.work_status || "new");
      const { error } = await supabase.from(FEEDBACK_TABLE).update({ submission_data: submissionData, work_status: nextWorkStatus }).eq("id", message.id);
      if (error) {
        setSubmissionEditStatus("error");
        return;
      }
      if (libraryItem) {
        setPublicLibrary((current) => [...current, { ...libraryItem, publicLibraryOwnerId: user.id }]);
      }
      setFeedbackMessages((messages) => messages.map((entry) => entry.id === message.id ? { ...entry, submission_data: submissionData, work_status: nextWorkStatus } : entry));
    }
    setMaps((current) => current.filter((map) => map.id !== context.draftId));
    if (user) void supabase.from("maps").delete().eq("id", context.draftId);
    setActiveMapId(null);
    setSubmissionEditContext(null);
    setSubmissionEditStatus("");
    setFeedbackInboxSection("sketches");
    const positions = JSON.parse(localStorage.getItem(SCROLL_POSITIONS_KEY) || "{}");
    positions["feedback-inbox"] = context.originScrollY || 0;
    localStorage.setItem(SCROLL_POSITIONS_KEY, JSON.stringify(positions));
    preservedScrollRef.current = { screen: "feedback-inbox", position: context.originScrollY || 0 };
    setScreen("feedback-inbox");
    localStorage.removeItem(ACTIVE_MAP_KEY);
  }

  function dismissVictory() {
    if (!showVictory || victoryDismissing) return;
    setVictoryDismissing(true);
    window.setTimeout(() => {
      setShowVictory(false);
      setVictoryDismissing(false);
    }, 360);
  }

  function openAccountMenu() {
    window.clearTimeout(accountHoverCloseRef.current);
    window.clearTimeout(accountCloseAnimationRef.current);
    setIsAccountClosing(false);
    setIsLanguageOpen(false);
    setIsAccountOpen(true);
  }

  function closeAccountMenu() {
    if (!isAccountOpen || isAccountClosing) return;
    setIsAccountClosing(true);
    window.clearTimeout(accountCloseAnimationRef.current);
    accountCloseAnimationRef.current = window.setTimeout(() => {
      setIsAccountOpen(false);
      setIsAccountClosing(false);
    }, 190);
  }

  function openHistoryModal(map) {
    window.clearTimeout(historyCloseTimerRef.current);
    setHistoryClosing(false);
    setHistoryViewMode("changes");
    setHistoryPreviewMode("template");
    setHistoryMapId(map.id);
    setHistoryPreviewIndex(Math.max(0, (map.versions?.length || 1) - 1));
    setHistoryPlaying(false);
    setFeatureStatus("");
  }

  function closeHistoryModal() {
    if (!historyMapId || historyClosing) return;
    setHistoryPlaying(false);
    setHistoryClosing(true);
    window.clearTimeout(historyCloseTimerRef.current);
    historyCloseTimerRef.current = window.setTimeout(() => {
      setHistoryMapId(null);
      setHistoryClosing(false);
      setDeletingVersionId("");
    }, 190);
  }

  function changeHistoryViewMode(mode) {
    setHistoryPlaying(false);
    setHistoryViewMode(mode);
    const entries = (historyMap?.versions || []).map((version, index) => ({ version, index }));
    const visible = mode === "changes" ? entries : [...entries.reduce((days, entry) => {
      days.set(getActivityDate(new Date(entry.version.createdAt)), entry);
      return days;
    }, new Map()).values()];
    setHistoryPreviewIndex(visible.at(-1)?.index || 0);
  }

  function changeHistoryPlaybackSpeed(speed) {
    historyPlaybackSpeedRef.current = speed;
    setHistoryPlaybackSpeed(speed);
  }

  function changeHistoryPreviewMode(mode) {
    if (mode === historyPreviewMode) return;
    const nextEntries = mode === "cells"
      ? (() => {
          const gameStart = historyVersionEntries.findIndex(({ version }) => version.isGameMode);
          return gameStart >= 0 ? historyVersionEntries.slice(gameStart) : historyVersionEntries;
        })()
      : historyVersionEntries;
    const currentPosition = nextEntries.findIndex((entry) => entry.index === historyPreviewIndex);
    const nextPosition = Math.max(0, currentPosition);
    historyPlaybackPositionRef.current = nextPosition;
    if (nextEntries[nextPosition]) setHistoryPreviewIndex(nextEntries[nextPosition].index);
    setHistoryPreviewMode(mode);
  }

  async function persistFeatureMap(map) {
    const normalized = normalizeMap(map);
    clearTimeout(saveTimerRef.current);
    if (normalized.id === activeMapId) activeMapRef.current = normalized;
    setMaps((current) => current.map((item) => item.id === normalized.id ? normalized : item));
    if (user) {
      const error = await remoteSave(normalized);
      setFeatureStatus(error ? "Изменения сохранены на устройстве. Не удалось синхронизировать с аккаунтом." : "");
    } else {
      setFeatureStatus("");
    }
    return normalized;
  }

  async function deleteMapVersion(map, version) {
    if (!map || !version || deletingVersionId) return;
    setHistoryPlaying(false);
    setDeletingVersionId(version.id);
    window.setTimeout(async () => {
      const current = maps.find((item) => item.id === map.id) || map;
      const index = (current.versions || []).findIndex((item) => item.id === version.id);
      if (index < 0) {
        setDeletingVersionId("");
        return;
      }
      const nextVersions = current.versions.filter((item) => item.id !== version.id);
      deletedVersionsRef.current = [{ mapId: current.id, version, index }, ...deletedVersionsRef.current].slice(0, 20);
      await persistFeatureMap({ ...current, versions: nextVersions });
      setHistoryPreviewIndex(nextVersions.length ? Math.min(index, nextVersions.length - 1) : 0);
      setDeletingVersionId("");
      const notice = { mapId: current.id, versionId: version.id, label: version.label, deadline: Date.now() + 5000 };
      setVersionUndoClosing(false);
      setVersionUndoNotice(notice);
      setDeleteCountdownNow(Date.now());
      window.clearTimeout(versionUndoTimerRef.current);
      window.clearTimeout(versionUndoCloseTimerRef.current);
      versionUndoTimerRef.current = window.setTimeout(() => {
        setVersionUndoClosing(true);
        versionUndoCloseTimerRef.current = window.setTimeout(() => {
          setVersionUndoNotice((currentNotice) => currentNotice?.versionId === version.id ? null : currentNotice);
          setVersionUndoClosing(false);
        }, 360);
      }, 5000);
    }, 210);
  }

  async function undoDeletedVersion() {
    const deleted = deletedVersionsRef.current.shift();
    if (!deleted) return;
    const map = maps.find((item) => item.id === deleted.mapId);
    if (!map) {
      setFeatureStatus("Карта для этой версии больше не найдена.");
      return;
    }
    const versions = [...(map.versions || [])];
    if (!versions.some((version) => version.id === deleted.version.id)) {
      versions.splice(Math.min(deleted.index, versions.length), 0, deleted.version);
    }
    const restored = await persistFeatureMap({ ...map, versions });
    if (historyMapId !== restored.id) openHistoryModal(restored);
    setHistoryPreviewIndex(restored.versions.findIndex((version) => version.id === deleted.version.id));
    setRestoredVersionId(deleted.version.id);
    window.clearTimeout(versionUndoTimerRef.current);
    window.clearTimeout(versionUndoCloseTimerRef.current);
    setVersionUndoClosing(true);
    versionUndoCloseTimerRef.current = window.setTimeout(() => {
      setVersionUndoNotice(null);
      setVersionUndoClosing(false);
    }, 360);
    window.setTimeout(() => setRestoredVersionId(""), 650);
  }

  async function clearActivityDay(item) {
    if (!item?.cells || activityClearingDate) return;
    const readableDate = item.date.toLocaleDateString("ru-RU");
    if (!window.confirm(`Очистить активность за ${readableDate}? Будут удалены ${item.cells} ${cellWord(item.cells)} из истории.`)) return;

    setActivityClearingDate(item.key);
    setActivityClearStatus("Очищаем день…");
    const changedMaps = maps
      .filter((map) => (map.activityLog || []).some((entry) => entry.date === item.key))
      .map((map) => normalizeMap({
        ...map,
        activityLog: (map.activityLog || []).filter((entry) => entry.date !== item.key),
        dailyPlanDoneOn: map.dailyPlanDoneOn === item.key ? "" : map.dailyPlanDoneOn,
      }));
    const changedById = new Map(changedMaps.map((map) => [map.id, map]));
    setMaps((current) => current.map((map) => changedById.get(map.id) || map));

    const activeNext = changedById.get(activeMapId);
    if (activeNext) {
      activeMapRef.current = activeNext;
      activityLogRef.current = activeNext.activityLog;
      setActivityLog(activeNext.activityLog);
    }

    try {
      const results = user ? await Promise.allSettled(changedMaps.map((map) => remoteSave(map))) : [];
      const syncFailed = results.some((result) => result.status === "rejected" || result.value);
      setActivityClearStatus(syncFailed
        ? "День очищен на устройстве. Синхронизация продолжится после восстановления связи."
        : `Активность за ${readableDate} очищена.`);
    } finally {
      setActivityClearingDate("");
    }
  }

  async function saveMapVersion(map, label = "Сохранённая версия") {
    if (featureBusyRef.current) return;
    featureBusyRef.current = true;
    setFeatureStatus("Сохраняем…");
    try {
    const current = map.id === activeMapId ? buildCurrentMap() || map : map;
    const versioned = normalizeMap({ ...current, versions: [...(current.versions || []), createMapSnapshot(current, label)] });
    await persistFeatureMap(versioned);
    setHistoryMapId(versioned.id);
    setHistoryPreviewIndex(versioned.versions.length - 1);
    } finally { featureBusyRef.current = false; }
  }

  async function restoreMapVersion(map, snapshot) {
    if (featureBusyRef.current) return;
    featureBusyRef.current = true;
    setFeatureStatus("Восстанавливаем…");
    try {
    const current = map.id === activeMapId ? buildCurrentMap() || map : map;
    const withCurrent = { ...current, versions: [...(current.versions || []), createMapSnapshot(current, "Перед восстановлением")] };
    const restored = normalizeMap(restoreSnapshot(withCurrent, snapshot));
    if (restored.id === activeMapId) openMap(restored);
    await persistFeatureMap(restored);
    setHistoryMapId(restored.id);
    setHistoryPlaying(false);
    setHistoryPreviewIndex(Math.max(0, restored.versions.length - 1));
    } finally { featureBusyRef.current = false; }
  }

  async function publishShare() {
    if (!shareMap || !user || shareStatus === "saving") return;
    setShareStatus("saving");
    const id = shareMap.shareId || crypto.randomUUID();
    const source = shareMap.id === activeMapId ? buildCurrentMap() || shareMap : shareMap;
    const settings = { showProgress: shareProgressVisible, showActivity: shareActivityVisible };
    const safeMap = publicSnapshot(source, settings);
    const readiness = await supabase.rpc("get_shared_map", { share_token: id });
    const { error } = readiness.error ? readiness : await supabase.from(SHARED_MAPS_TABLE).upsert({
      id,
      owner_id: user.id,
      map_id: source.id,
      map_data: safeMap,
      settings,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (error) {
      try {
        const snapshot = await encodeSharedSnapshot({ map: safeMap, settings, updated_at: new Date().toISOString() });
        if (snapshot.length > 60000) throw new Error("share-too-large");
        const url = `${window.location.origin}/#snapshot=${snapshot}`;
        if (navigator.clipboard) await navigator.clipboard.writeText(url).catch(() => null);
        setShareMap({ ...shareMap, shareUrl: url, portableShare: true });
        setShareStatus("portable");
      } catch {
        setShareStatus("error");
      }
      return;
    }
    const url = `${window.location.origin}/?shared=${id}`;
    await persistFeatureMap({ ...source, shareId: id });
    if (navigator.clipboard) await navigator.clipboard.writeText(url).catch(() => null);
    setShareMap({ ...shareMap, shareId: id, shareUrl: url, portableShare: false });
    setShareStatus("copied");
  }

  function openShareDialog(map) {
    setShareMap({ ...map, shareUrl: map.shareId ? `${window.location.origin}/?shared=${map.shareId}` : "" });
    setShareProgressVisible(true);
    setShareActivityVisible(false);
    setShareStatus("");
  }

  async function revokeShare() {
    if (!shareMap?.shareId || !user) return;
    setShareStatus("saving");
    const { error } = await supabase.from(SHARED_MAPS_TABLE).delete().eq("id", shareMap.shareId).eq("owner_id", user.id);
    setShareStatus(error ? "error" : "revoked");
    if (!error) {
      const current = shareMap.id === activeMapId ? buildCurrentMap() || shareMap : maps.find((map) => map.id === shareMap.id) || shareMap;
      await persistFeatureMap({ ...current, shareId: "" });
      setShareMap(null);
    }
  }

  function exportBackup() {
    const latest = activeMapId && !publicLibraryEditContext ? buildCurrentMap() : null;
    const exported = maps.map((map) => map.id === latest?.id ? latest : map);
    const blob = new Blob([createBackup([...exported, ...personalLibrary.map((item) => ({ ...item, privateLibraryItem: true }))])], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `map-method-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    setBackupStatus("Копия скачана.");
  }

  async function importBackup(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !user || featureBusyRef.current) return;
    featureBusyRef.current = true;
    setBackupStatus("Импортируем…");
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error("backup-too-large");
      const imported = parseBackup(await file.text()).map((map, index) => normalizeMap({
        ...map,
        id: createMapId(),
        shareId: "",
        order: maps.length + index,
      }));
      setMaps((current) => [...current, ...imported.filter((map) => !map.privateLibraryItem)]);
      setPrivateLibrary((current) => ({ ...current, [user.id]: [...(current[user.id] || []), ...imported.filter((map) => map.privateLibraryItem)] }));
      const errors = await Promise.all(imported.map((map) => remoteSave(map)));
      setBackupStatus(`Добавлено карт и эскизов: ${imported.length}.${errors.some(Boolean) ? " Есть несинхронизированные данные; сохрани файл копии до восстановления связи." : ""}`);
    } catch {
      setBackupStatus("Не удалось прочитать эту резервную копию.");
    } finally { featureBusyRef.current = false; }
  }

  async function createDemoMap() {
    if (!user || featureBusyRef.current) return;
    featureBusyRef.current = true;
    try {
    const demo = normalizeMap({
      id: createMapId(), order: 0, name: "Моя первая карта", description: "Небольшая карта, чтобы попробовать Map Method",
      category: "Личное", mapType: "free", gridMode: "manual", totalCells: "64", manualRows: "8", manualCols: "8",
      completed: [18,19,20,21,25,26,27,28,29,30,34,35,36,37,42,43,44,51], colors: [], createdAt: new Date().toISOString(),
      isGameMode: true,
    });
    setMaps((current) => [...current, demo]);
    if (user) await remoteSave(demo);
    localStorage.setItem(`${ONBOARDING_KEY}:${user.id}`, "done");
    setOnboardingOpen(false);
    setActiveMapId(demo.id);
    openMap(demo);
    setScreen("editor");
    } finally { featureBusyRef.current = false; }
  }

  function finishOnboarding() {
    if (user?.id) localStorage.setItem(`${ONBOARDING_KEY}:${user.id}`, "done");
    setOnboardingOpen(false);
  }

  async function installApp() {
    await openApp({ win: window, prompt: installPrompt, installed: appInstalled,
      showHelp: () => setAppHelpOpen(true), clearPrompt: () => setInstallPrompt(null) });
  }

  return (
    <div className="app">
      {syncStatus && <div className="sync-status" role="status">{syncStatus}</div>}
      {showVictory && (
        <div className={`victory-overlay${victoryDismissing ? " is-dismissing" : ""}`} role="status" onPointerDown={dismissVictory}>
          <div className="victory-confetti" aria-hidden="true">
            {Array.from({ length: 28 }, (_, index) => (
              <i
                key={index}
                style={{
                  "--particle": index,
                  "--x": `${(index * 37) % 100}%`,
                  "--y": `${(index * 53) % 72}%`,
                  "--drift-x": `${((index % 7) - 3) * 16}px`,
                  "--drift-y": `${(Math.floor(index / 7) - 2) * 18}px`,
                }}
              >
                ✦
              </i>
            ))}
          </div>
          <div className="victory-summary" onPointerDown={(event) => event.stopPropagation()}>
            <button type="button" className="victory-close" aria-label="Закрыть" onClick={dismissVictory}>×</button>
            <span className="victory-mark">✓</span>
            <strong>Карта завершена!</strong>
            <span>«{activeMap?.name}» собрана полностью.</span>
            <div>
              <article><b>{currentStats.total}</b><small>клеток в карте</small></article>
              <article><b>{activityLog.filter((entry) => entry.cells > 0).length}</b><small>активных дней</small></article>
              <article><b>{activeMap?.createdAt ? Math.max(1, Math.ceil((Date.now() - Date.parse(activeMap.createdAt)) / 86400000)) : "—"}</b><small>дней от старта</small></article>
            </div>
            <div className="victory-actions"><button type="button" onClick={() => downloadMap(true)}>Скачать с сеткой клеток</button><button type="button" onClick={() => downloadMap(false)}>Скачать без сетки клеток</button></div>
          </div>
        </div>
      )}
      {switchingAccountId && (
        <div className="account-switching-overlay" role="status">
          <span />
          <strong>Переключаем аккаунт…</strong>
        </div>
      )}
      {savedAccountDragVisual && (
        <div
          className={`saved-account-drag-ghost${savedAccountDragVisual.settling ? " is-settling" : ""}`}
          style={{
            left: savedAccountDragVisual.left,
            top: savedAccountDragVisual.top,
            width: savedAccountDragVisual.width,
            height: savedAccountDragVisual.height,
          }}
          aria-hidden="true"
        >
          <span className="saved-account-avatar">{savedAccountDragVisual.account.name?.charAt(0).toUpperCase() || "M"}</span>
          <i><strong>{savedAccountDragVisual.account.name}</strong><small>{savedAccountDragVisual.account.email}</small></i>
          <span className="saved-account-handle">≡</span>
        </div>
      )}
      <header className="header">
        <div className="header-back-links">
          <button
            className="back-link"
            onClick={() => {
              setMapCategoryFilter("Все");
              setScreen("maps");
            }}
          >
            ← {t("myMaps")}
          </button>
          {publicLibraryEditContext && (
            <button className="back-link library-return-link" onClick={() => finishPublicLibraryEditing(false)}>
              Вернуться в библиотеку
            </button>
          )}
        </div>

        <a
          href="/"
          className="editor-brand"
          onClick={(event) => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            setScreen("home");
          }}
        >
          <img className="brand-mark" src={`${import.meta.env.BASE_URL}mm-logo.png`} alt="" />

          <span className="brand-context" key={`${screen}-${language}`}>
            {screen === "home"
              ? `MM / ${t("home")}`
              : screen === "maps"
              ? `MM / ${t(
                  "myMaps"
                )}`
              : screen === "library"
              ? "MM / Библиотека"
              : screen === "feedback-inbox"
              ? "MM / Обращения"
              : screen === "analytics"
              ? "MM / Аналитика"
              : screen === "shared"
              ? "MM / Публичная карта"
              : screen ===
                "account"
              ? `MM / ${t(
                  "account"
                )}`
              : t("editor")}
          </span>
        </a>

        <div className="header-actions">
          {screen === "home" && (
            <button
              className="home-how-btn"
              onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
            >
              Как это работает
            </button>
          )}
          <div ref={languageRef} className={`language-menu${isLanguageOpen ? " is-open" : ""}`}>
            <button type="button" className="language-select" onClick={() => { closeAccountMenu(); setIsLanguageOpen((open) => !open); }}>
              {LANGUAGE_OPTIONS.find(([code]) => code === language)?.[1] || "Русский"} <span className="menu-chevron" aria-hidden="true" />
            </button>
            {isLanguageOpen && (
              <div className="language-popover">
                {LANGUAGE_OPTIONS.map(([code, label]) => (
                  <button key={code} className={language === code ? "active" : ""} onClick={() => { setLanguage(code); setIsLanguageOpen(false); }}>{label}</button>
                ))}
              </div>
            )}
          </div>

          {screen === "editor" && (
            <>
              <button className="download-map-btn" onClick={() => { setClosingModal(""); setDownloadChoice({ type: "current" }); }} disabled={!activeMap}>
                ↓ Скачать
              </button>

              <button className="save-map-btn" onClick={saveActiveMap} disabled={!activeMap}>
                {saveStatus === "error" ? "Ошибка" : saveStatus ? t("saved") : t("save")}
              </button>
            </>
          )}

          {!user && (
            <button
              type="button"
              className="account-login-btn"
              onClick={() => setScreen("auth")}
            >
              👤 {t("account")}
            </button>
          )}

          {user && (
            <div
              ref={accountRef}
              className={`account-menu${isAccountOpen && !isAccountClosing ? " is-open" : ""}${isAccountClosing ? " is-closing" : ""}`}
              onMouseEnter={openAccountMenu}
              onMouseLeave={() => {
                window.clearTimeout(accountHoverCloseRef.current);
                accountHoverCloseRef.current = window.setTimeout(closeAccountMenu, 110);
              }}
              style={{
                position:
                  "relative",
                marginLeft:
                  "8px",
              }}
            >
              <button
                type="button"
                className="account-trigger"
                onClick={() => {
                  if (isAccountOpen && !isAccountClosing) closeAccountMenu();
                  else openAccountMenu();
                }}
                style={{
                  display: "flex",
                  alignItems:
                    "center",
                  gap: "9px",
                  height: "40px",
                  padding:
                    "4px 10px 4px 5px",
                  border:
                    "1px solid #ddd8cf",
                  borderRadius:
                    "12px",
                  background:
                    "#fff",
                  cursor:
                    "pointer",
                  color:
                    "#20201d",
                  fontSize:
                    "13px",
                  fontWeight:
                    600,
                  width: `calc(70px + ${accountTriggerCharacters * 1.12}ch)`,
                }}
              >
                <span
                  key={accountInitial}
                  className="header-account-initial"
                  style={{
                    width: "30px",
                    height: "30px",
                    borderRadius:
                      "9px",
                    background:
                      "#34c759",
                    color:
                      "#fff",
                    display:
                      "grid",
                    placeItems:
                      "center",
                    fontSize:
                      "13px",
                    fontWeight:
                      700,
                  }}
                >
                  {accountInitial}
                </span>

                <span
                  key={accountName}
                  className="header-account-name"
                  style={{
                    maxWidth:
                      "110px",
                    overflow:
                      "hidden",
                    textOverflow:
                      "ellipsis",
                    whiteSpace:
                      "nowrap",
                  }}
                >
                  {headerAccountName}
                </span>

                {isLibraryOwner && unreadFeedbackCount > 0 && (
                  <span className="header-message-badge" aria-label={`Новых обращений: ${unreadFeedbackCount}`}>
                    {unreadFeedbackCount > 9 ? "9+" : unreadFeedbackCount}
                  </span>
                )}

                <span className="menu-chevron" aria-hidden="true" />
              </button>

              {(isAccountOpen || isAccountClosing) && (
                <div
                  className={`account-popover${isAccountClosing ? " is-closing" : ""}`}
                  style={{
                    position:
                      "absolute",
                    top:
                      "calc(100% + 8px)",
                    right: 0,
                    width:
                      "240px",
                    padding:
                      "8px",
                    background:
                      "#fff",
                    border:
                      "1px solid #ded9d0",
                    borderRadius:
                      "16px",
                    boxShadow:
                      "0 14px 35px rgba(40,35,25,.12)",
                    zIndex: 1000,
                  }}
                >
                  <div
                    style={{
                      padding:
                        "10px 11px 12px",
                      borderBottom:
                        "1px solid #eeeae3",
                      marginBottom:
                        "5px",
                    }}
                  >
                    <div
                      style={{
                        fontSize:
                          "14px",
                        fontWeight:
                          700,
                        color:
                          "#20201d",
                      }}
                    >
                      {accountName}
                    </div>

                    <div
                      style={{
                        marginTop:
                          "3px",
                        fontSize:
                          "11px",
                        color:
                          "#8a867e",
                        overflow:
                          "hidden",
                        textOverflow:
                          "ellipsis",
                        whiteSpace:
                          "nowrap",
                      }}
                    >
                      {accountEmail}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="account-popover-action"
                    onClick={() => {
                      closeAccountMenu();
                      setScreen(
                        "account"
                      );
                    }}
                    style={{
                      width:
                        "100%",
                      border: 0,
                      background:
                        "transparent",
                      padding:
                        "10px 11px",
                      borderRadius:
                        "10px",
                      textAlign:
                        "left",
                      cursor:
                        "pointer",
                      fontSize:
                        "13px",
                      color:
                        "#20201d",
                    }}
                  >
                    👤{" "}
                    {t(
                      "account"
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      closeAccountMenu();
                      setScreen("library");
                    }}
                    className="account-popover-action"
                  >
                    ▧ Библиотека рисунков
                  </button>

                  <button
                    type="button"
                    className="account-popover-action"
                    onClick={() => {
                      closeAccountMenu();
                      setScreen(
                        "maps"
                      );
                    }}
                    style={{
                      width:
                        "100%",
                      border: 0,
                      background:
                        "transparent",
                      padding:
                        "10px 11px",
                      borderRadius:
                        "10px",
                      textAlign:
                        "left",
                      cursor:
                        "pointer",
                      fontSize:
                        "13px",
                      color:
                        "#20201d",
                    }}
                  >
                    ▦{" "}
                    {t(
                      "myMaps"
                    )}
                  </button>

                  <button
                    type="button"
                    className="account-popover-action account-switch-action"
                    onClick={() => setIsAccountSwitcherOpen((open) => !open)}
                  >
                    ⇄ Сменить аккаунт
                  </button>

                  {isAccountSwitcherOpen && (
                    <div className="saved-account-list">
                      {otherSavedAccounts.map((account) => (
                        <div
                          role="button"
                          tabIndex={0}
                          className={`saved-account-item${savedAccountDragId === account.id ? " is-dragging" : ""}${savedAccountDropId === account.id ? " is-drop-target" : ""}${removingSavedAccountId === account.id ? " is-removing" : ""}`}
                          data-saved-account-id={account.id}
                          key={account.id}
                          onClick={() => {
                            if (!suppressSavedAccountClickRef.current) switchToSavedAccount(account);
                          }}
                          onKeyDown={(event) => {
                            if ((event.key === "Enter" || event.key === " ") && !suppressSavedAccountClickRef.current) {
                              event.preventDefault();
                              switchToSavedAccount(account);
                            }
                          }}
                        >
                          <span className="saved-account-avatar">{account.name?.charAt(0).toUpperCase() || "M"}</span>
                          <i><strong>{account.name}</strong><small>{account.email}</small></i>
                          <button
                            type="button"
                            className="saved-account-remove"
                            aria-label={`Удалить ${account.name} из списка`}
                            onKeyDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setIsAccountRemoveClosing(false);
                              setAccountToRemove(account);
                            }}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8v10m4-10v10m4-10v10M5 5h14M9 5V3h6v2m3 0-1 16H7L6 5" /></svg>
                          </button>
                          <span
                            className="saved-account-handle"
                            aria-label="Перетащить аккаунт"
                            onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}
                            onPointerDown={(event) => startSavedAccountDrag(event, account)}
                            onPointerMove={moveSavedAccountDrag}
                            onPointerUp={(event) => finishSavedAccountDrag(event)}
                            onPointerCancel={(event) => finishSavedAccountDrag(event, true)}
                          >≡</span>
                        </div>
                      ))}
                      <button type="button" className="add-account-action" onClick={handleSwitchAccount}>＋ Добавить аккаунт</button>
                    </div>
                  )}

                  {isLibraryOwner && (
                    <>
                      <button type="button" className="account-popover-action inbox-menu-action" onClick={openFeedbackInbox}>
                        ✉ Обращения
                        {unreadFeedbackCount > 0 && <span>{unreadFeedbackCount > 99 ? "99+" : unreadFeedbackCount}</span>}
                      </button>
                      <button type="button" className="account-popover-action" onClick={() => { closeAccountMenu(); setScreen("analytics"); }}>
                        ◫ Аналитика сайта
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    className="account-popover-action feedback-menu-action"
                    onClick={() => {
                      closeAccountMenu();
                      setFeedbackEmail(user?.email || "");
                      setFeedbackFiles([]);
                      setFeedbackStatus("");
                      setClosingModal("");
                      setIsFeedbackOpen(true);
                    }}
                  >
                    ✉ Обратная связь
                  </button>

                  <button
                    type="button"
                    className="account-popover-action account-popover-logout"
                    onClick={
                      handleSignOut
                    }
                    style={{
                      width:
                        "100%",
                      border: 0,
                      background:
                        "transparent",
                      padding:
                        "10px 11px",
                      borderRadius:
                        "10px",
                      textAlign:
                        "left",
                      cursor:
                        "pointer",
                      fontSize:
                        "13px",
                      color:
                        "#d9342b",
                    }}
                  >
                    ↪{" "}
                    {t(
                      "logout"
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {screen === "home" && (
        <main className="home-page">
          <section className="landing-hero landing-hero-intro">
            <div className="landing-copy">
              <span className="landing-label">
                Прогресс, который видно
              </span>

              <h1>
                Преврати каждый маленький шаг в картинку.
              </h1>

              <p>
                Map Method помогает замечать путь: каждый небольшой шаг остаётся на карте и постепенно складывается в историю твоего движения вперёд.
              </p>

              <div className="home-actions">
                <button
                  className="save-map-btn"
                  onClick={
                    openCreateModal
                  }
                >
                  Создать карту →
                </button>

                <button
                  className="home-secondary-btn"
                  onClick={() =>
                    document
                      .getElementById(
                        "pyramid-demo"
                      )
                      ?.scrollIntoView(
                        {
                          behavior:
                            "smooth",
                        }
                      )
                  }
                >
                  Попробовать сетку ↓
                </button>
              </div>
            </div>

            <aside className="hero-note" aria-label="Что даёт Map Method">
              <div className="hero-note-cells">
                {Array.from({ length: 100 }, (_, index) => (
                  <button
                    key={index}
                    type="button"
                    className={heroNoteCells.has(index) ? "filled" : ""}
                    aria-label={`Клетка ${index + 1}`}
                    onPointerDown={(event) => beginHeroNoteStroke(event, index)}
                    onPointerEnter={(event) => continueHeroNoteStroke(event, index)}
                    onContextMenu={(event) => event.preventDefault()}
                  />
                ))}
              </div>
              <strong>Путь складывается из маленьких действий.</strong>
              <p>Нарисуй свою форму и отмечай движение так, как удобно тебе.</p>
            </aside>

          </section>

          <section className="landing-pyramid-section" id="pyramid-demo">
            <div className="pyramid-card">
              {showDemoVictory && (
                <div className="demo-victory" role="status">
                  <div aria-hidden="true">✦ ✺ ✧ ✦ ✺ ✧</div>
                  <strong>Пирамида собрана!</strong>
                  <span>Вот это упорство.</span>
                </div>
              )}
              <div className="pyramid-layout">
                <div className="hero-demo-wrap">
                  <div className="hero-grid demo-interactive hero-pyramid" onContextMenu={(event) => event.preventDefault()}>
                    {DEMO_PYRAMID_ROWS.map((count, row) => (
                      <div className="hero-pyramid-row" key={row}>
                        {Array.from({ length: count }, (_, column) => {
                          const index = DEMO_PYRAMID_ROWS.slice(0, row).reduce((sum, value) => sum + value, 0) + column;
                          return (
                            <button
                              key={index}
                              type="button"
                              className={heroDemoCells.has(index) ? "filled" : ""}
                              onPointerDown={(event) => beginDemoStroke(event, index)}
                              onPointerEnter={(event) => continueDemoStroke(event, index)}
                              onContextMenu={(event) => event.preventDefault()}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="pyramid-copy">
                  <span className="landing-label">Интерактивная карта</span>
                  <h2>Каждый шаг становится частью рисунка</h2>
                  <p>Нажимай на клетки слева и наблюдай, как небольшие ежедневные действия складываются в заметный результат.</p>
                  <div className="hero-demo-progress">
                    <strong>{Math.min(100, Math.round((heroDemoCells.size / DEMO_PYRAMID_TOTAL) * 100))}%</strong>
                    <span>{Math.min(heroDemoCells.size, DEMO_PYRAMID_TOTAL)} из {DEMO_PYRAMID_TOTAL} клеток</span>
                  </div>
                  <div className="pyramid-progress" aria-label={`Прогресс пирамиды: ${heroDemoCells.size} из ${DEMO_PYRAMID_TOTAL}`}>
                    <i style={{ width: `${Math.min(100, (heroDemoCells.size / DEMO_PYRAMID_TOTAL) * 100)}%` }} />
                  </div>
                  <small>Каждая клетка — одно маленькое действие.</small>
                </div>
              </div>
            </div>
          </section>

          <section className="idea-section" id="how-it-works">
            <span className="landing-label">
              Идея
            </span>

            <h2>
              Достаточно просто для<br /> каждого дня.
            </h2>

            <div className="idea-steps">
              <article>
                <span>01</span>

                <h3>Выбери карту</h3>

                <p>Нарисуй карту кистью или загрузи изображение — оба способа превращают идею в наглядный путь.</p>
              </article>

              <article>
                <span>02</span>

                <h3>Закрась клетку</h3>

                <p>Одно действие становится видимой частью картинки.</p>
              </article>

              <article>
                <span>03</span>

                <h3>Смотри, как она появляется</h3>

                <p>Возвращайся позже и продолжай, не теряя прогресс.</p>
              </article>
            </div>
          </section>

          <section className="landing-final">
            <span className="landing-label">
              Твой маршрут
            </span>

            <h2>
              Начни с одной клетки. Продолжи своей картой.
            </h2>

            <p>
              Выбери форму, цвет и ритм. Map Method сохранит путь, чтобы к нему всегда можно было вернуться.
            </p>

            <button
              className="save-map-btn"
              onClick={
                openCreateModal
              }
            >
              ＋ Создать карту
            </button>
          </section>

          <footer className="landing-footer">
            <strong>
              Map Method — путь, который можно увидеть.
            </strong>

            <span>
              Прогресс, который видно
            </span>
          </footer>
        </main>
      )}

      {screen === "auth" && (
        <Auth
          language={language}
          onAuth={() => {
            setScreen("account");
          }}
        />
      )}

      {screen === "shared" && (
        <main className="shared-map-page">
          {sharedViewStatus === "loading" ? <p className="shared-map-message">Загружаем карту…</p> : sharedViewStatus === "missing" ? (
            <section className="shared-map-empty"><span>Ссылка недоступна</span><h1>Эта карта больше не опубликована</h1><p>Владелец мог отключить ссылку или заменить её.</p><button type="button" onClick={() => { history.replaceState({}, "", "/"); setScreen("home"); }}>На главную</button></section>
          ) : sharedView ? (() => {
            const map = sharedView.map;
            const dimensions = getGridDimensions(map.totalCells, map.imageRatio, map.gridMode, map.manualRows, map.manualCols);
            const stats = getMapStats(map);
            const publicMap = sharedView.settings?.showProgress === false ? { ...map, progressCompleted: [] } : map;
            return <section className="shared-map-card">
              <div><span className="account-eyebrow">ПУБЛИЧНАЯ КАРТА</span><h1>{map.name}</h1>{map.description && <p>{map.description}</p>}</div>
              <div className="shared-map-preview"><MapCardGrid map={publicMap} dimensions={dimensions} /></div>
              {sharedView.settings?.showProgress !== false && <div className="shared-map-progress"><strong><AnimatedPercent value={stats.percent} /></strong><span>{stats.filled} из {stats.total} клеток</span><i><b style={{ width: `${stats.percent}%` }} /></i></div>}
              {sharedView.settings?.showActivity && map.lastPaintedAt && <small>Последнее изменение: {new Date(map.lastPaintedAt).toLocaleString("ru-RU")}</small>}
              <button type="button" onClick={() => { history.replaceState({}, "", "/"); setScreen("home"); }}>Создать свою карту</button>
            </section>;
          })() : null}
        </main>
      )}

      {screen === "account" && (
        <section
          className="maps-page"
          style={{
            maxWidth:
              "1100px",
            margin:
              "0 auto",
            width:
              "100%",
          }}
        >
          <div className="maps-page-header">
            <div>
              <h1>
                {t(
                  "account"
                )}
              </h1>
            </div>

          </div>

          <div
            className="legacy-account-summary"
            style={{
              display:
                "grid",
              gridTemplateColumns:
                "minmax(280px, 360px) 1fr",
              gap: "20px",
              marginTop:
                "24px",
            }}
          >
            <div
              style={{
                background:
                  "#fff",
                border:
                  "1px solid #ddd8cf",
                borderRadius:
                  "20px",
                padding:
                  "24px",
              }}
            >
              <div
                style={{
                  width:
                    "72px",
                  height:
                    "72px",
                  borderRadius:
                    "20px",
                  background:
                    "#34c759",
                  color:
                    "#fff",
                  display:
                    "grid",
                  placeItems:
                    "center",
                  fontSize:
                    "28px",
                  fontWeight:
                    700,
                  marginBottom:
                    "18px",
                }}
              >
                {accountInitial}
              </div>

              <h2
                style={{
                  margin: 0,
                  fontSize:
                    "22px",
                }}
              >
                {accountName}
              </h2>

              <p
                style={{
                  margin:
                    "7px 0 0",
                  color:
                    "#8a867e",
                  fontSize:
                    "13px",
                }}
              >
                {accountEmail}
              </p>
            </div>

            <div
              style={{
                display:
                  "grid",
                gridTemplateColumns:
                  "repeat(2, minmax(150px, 1fr))",
                gap:
                  "14px",
              }}
            >
              <div
                style={{
                  background:
                    "#fff",
                  border:
                    "1px solid #ddd8cf",
                  borderRadius:
                    "20px",
                  padding:
                    "22px",
                }}
              >
                <span
                  style={{
                    display:
                      "block",
                    fontSize:
                      "11px",
                    textTransform:
                      "uppercase",
                    letterSpacing:
                      ".08em",
                    color:
                      "#8a867e",
                    marginBottom:
                      "10px",
                  }}
                >
                  {t(
                    "accountMaps"
                  )}
                </span>

                <strong
                  style={{
                    fontSize:
                      "32px",
                  }}
                >
                  {maps.length}
                </strong>

                <p
                  style={{
                    margin:
                      "5px 0 0",
                    color:
                      "#8a867e",
                  }}
                >
                  {t(
                    "myMaps"
                  )}
                </p>
              </div>

              <div
                style={{
                  background:
                    "#fff",
                  border:
                    "1px solid #ddd8cf",
                  borderRadius:
                    "20px",
                  padding:
                    "22px",
                }}
              >
                <span
                  style={{
                    display:
                      "block",
                    fontSize:
                      "11px",
                    textTransform:
                      "uppercase",
                    letterSpacing:
                      ".08em",
                    color:
                      "#8a867e",
                    marginBottom:
                      "10px",
                  }}
                >
                  {t(
                    "accountCells"
                  )}
                </span>

                <strong
                  style={{
                    fontSize:
                      "32px",
                  }}
                >
                  {maps.reduce(
                    (
                      sum,
                      m
                    ) =>
                      sum +
                      (m.completed
                        ?.length ||
                        0),
                    0
                  )}
                </strong>

                <p
                  style={{
                    margin:
                      "5px 0 0",
                    color:
                      "#8a867e",
                  }}
                >
                  {t(
                    "painted"
                  )}
                </p>
              </div>

              <div
                style={{
                  gridColumn:
                    "1 / -1",
                  background:
                    "#fff",
                  border:
                    "1px solid #ddd8cf",
                  borderRadius:
                    "20px",
                  padding:
                    "22px",
                }}
              >
                <span
                  style={{
                    display:
                      "block",
                    fontSize:
                      "11px",
                    textTransform:
                      "uppercase",
                    letterSpacing:
                      ".08em",
                    color:
                      "#8a867e",
                    marginBottom:
                      "10px",
                  }}
                >
                  MM — Map Method
                </span>

                <h3
                  style={{
                    margin: 0,
                    fontSize:
                      "20px",
                  }}
                >
                  {t(
                    "hero"
                  )}
                </h3>

                <p
                  style={{
                    margin:
                      "8px 0 18px",
                    color:
                      "#8a867e",
                    lineHeight:
                      1.5,
                  }}
                >
                  {t(
                    "accountDescription"
                  )}
                </p>

                <button
                  className="save-map-btn"
                  onClick={
                    openCreateModal
                  }
                >
                  +{" "}
                  {t(
                    "newMap"
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="account-dashboard">
            <section className="account-profile-card">
              <div className="account-avatar" key={accountInitial}>{accountInitial}</div>
              <div className="account-profile-copy">
                <span className="account-eyebrow">ТВОЙ ПРОФИЛЬ</span>
                <div className="account-name-slot">
                  {isEditingAccountName ? (
                  <div ref={accountNameEditorRef} className={`account-name-editor${isClosingAccountName ? " is-closing" : ""}`}>
                    <input
                      ref={accountNameInputRef}
                      value={accountNameDraft}
                      maxLength={20}
                      onChange={(event) => setAccountNameDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") saveAccountName();
                        if (event.key === "Escape") closeAccountNameEditor();
                      }}
                    />
                    <button type="button" onClick={saveAccountName}>Сохранить</button>
                    <button type="button" className="account-name-cancel" aria-label="Отменить" onClick={closeAccountNameEditor}>×</button>
                  </div>
                ) : (
                  <div className="account-name-row">
                    <h2 key={accountName}>{accountName}</h2>
                    {user && <button type="button" aria-label="Изменить ник" title="Изменить ник" onClick={openAccountNameEditor}>✎</button>}
                  </div>
                )}
                </div>
                <p>{accountEmail}</p>
                {!!accountNameStatus && <small className="account-name-status">{accountNameStatus}</small>}
              </div>
              <button className="account-maps-link" onClick={() => setScreen("maps")}>
                Мои карты →
              </button>
            </section>

            <section className="account-stat-grid">
              <button className="account-stat-card account-stat-action" onClick={() => setScreen("maps")}>
                <span>КАРТ СОЗДАНО</span>
                <strong>{maps.length}</strong>
                <small>Открыть мои карты →</small>
              </button>
              <div className="account-stat-card">
                <span>КЛЕТОК ЗАКРАШЕНО</span>
                <strong>{accountPaintedCells}</strong>
                <small>Во всех картах</small>
              </div>
              <div className="account-stat-card">
                <span>ЗАВЕРШЕНО</span>
                <strong>{accountFinishedMaps}</strong>
                <small>{accountFinishedMaps === 1 ? "Карта пройдена полностью" : "Карт пройдено полностью"}</small>
              </div>
            </section>

            <section className="account-history-card account-movement-card">
              <div>
                <span className="account-eyebrow">АКТИВНОСТЬ</span>
                <h2>История движения</h2>
                <p>Последние семь дней. Большие значения показаны по мягкой шкале, чтобы активность каждого дня оставалась заметной.</p>
              </div>
              <div className="history-chart">
                {accountHistory.map((item) => {
                  const relativeHeight = item.cells ? 16 + Math.sqrt(item.cells / accountHistoryMax) * 84 : 3;
                  const date = new Date(`${item.key}T12:00:00`);
                  return (
                  <div className="history-day" key={item.key}>
                    <i style={{ height: `${relativeHeight}%` }} />
                    <strong>{item.cells || "—"}</strong>
                    <span>{item.label}</span>
                    <button
                      type="button"
                      className="history-clear-day"
                      disabled={!item.cells || Boolean(activityClearingDate)}
                      aria-label={`Очистить активность за ${date.toLocaleDateString("ru-RU")}`}
                      data-tooltip={item.cells ? "Очистить этот день" : "В этот день активности нет"}
                      onClick={() => clearActivityDay({ ...item, date })}
                    ><svg className="history-clear-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2L2 10" /></svg></button>
                  </div>
                  );
                })}
              </div>
              <div className="streak-grid">
                <article><span>ТЕКУЩАЯ СЕРИЯ</span><strong>{streaks.current}</strong><small>дней с учётом одного дня отдыха</small></article>
                <article><span>ЛУЧШАЯ СЕРИЯ</span><strong>{streaks.best}</strong><small>личный рекорд</small></article>
                <article className="rest-day-card" tabIndex={0} data-tooltip="После 7 активных дней один пропуск не сбросит серию. День отдыха расходуется автоматически."><span>ДЕНЬ ОТДЫХА</span><strong>{streaks.freeDayAvailable ? "Доступен" : "Использован"}</strong><small>новый появляется после 7 активных дней</small></article>
              </div>
              {activityClearStatus && <p className="activity-clear-status">{activityClearStatus}</p>}
            </section>

            <section className="account-plan-card">
              <div>
                <span className="account-eyebrow">ПЛАН НА СЕГОДНЯ</span>
                <h2>{!accountTotalCells ? "Начни с первой карты" : accountDailyGoal ? "Двигайся в своём ритме" : "Все карты завершены"}</h2>
                <p>
                  {!accountTotalCells
                    ? "Создай карту, выбери рисунок — и здесь появится твой личный темп."
                    : accountDailyGoal
                    ? `Чтобы завершить текущие карты примерно за 30 дней, достаточно закрашивать ${accountDailyGoal} клеток в день.`
                    : "Отличная работа — на текущих картах не осталось незакрашенных клеток."}
                </p>
              </div>
              <div className="account-goal-progress">
                <div>
                  <strong><AnimatedPercent value={accountProgressPercent} /></strong>
                  <span>общий прогресс</span>
                </div>
                <div className="account-goal-track" aria-label={`Общий прогресс: ${accountProgressPercent}%`}>
                  <i style={{ width: `${accountProgressPercent}%` }} />
                </div>
                <small>{accountPaintedCells} из {accountTotalCells} клеток</small>
              </div>
            </section>

            <section className="account-tools-card">
              <div><span className="account-eyebrow">ДАННЫЕ И ПРИЛОЖЕНИЕ</span><h2>Твои карты под контролем</h2><p>Скачай резервную копию всех карт или верни её на любом устройстве.</p></div>
              <div className="account-tools-actions">
                <button type="button" onClick={exportBackup}>Скачать резервную копию</button>
                <button type="button" onClick={() => backupInputRef.current?.click()}>Восстановить из копии</button>
                <button type="button" onClick={installApp} disabled={appStandalone}>{appStandalone ? "Приложение уже открыто" : installPrompt ? "Установить Map Method" : appInstalled ? "Открыть приложение" : "Как открыть приложение"}</button>
                <input ref={backupInputRef} type="file" accept="application/json,.json" hidden onChange={importBackup} />
              </div>
              {backupStatus && <p className="feature-status" role="status">{backupStatus}</p>}
              <div className={`app-launch-help${appHelpOpen && !appStandalone ? " is-open" : ""}`} aria-hidden={!appHelpOpen || appStandalone} inert={!appHelpOpen || appStandalone}>
                <div><section>
                  <button type="button" className="modal-close" aria-label="Закрыть подсказку" onClick={() => setAppHelpOpen(false)}>×</button>
                  <strong>Map Method в отдельном окне</strong>
                  <p>Если приложение уже установлено, найди «Map Method» в меню «Пуск» или нажми значок «Открыть в приложении» справа в адресной строке браузера, в котором устанавливал его.</p>
                  <p>Если приложения там нет, открой сайт в Chrome или Edge и выбери в меню браузера «Установить Map Method» или «Установить этот сайт как приложение».</p>
                  <small>Если кнопка запуска не открыла окно, воспользуйся одним из способов выше: браузер мог ещё не обновить настройки установленного приложения.</small>
                </section></div>
              </div>
            </section>

            <section className="account-achievements">
              <div className="account-section-title">
                <div>
                  <span className="account-eyebrow">ДОСТИЖЕНИЯ</span>
                  <h2>Каждая карта оставляет след</h2>
                </div>
                <span>{accountAchievements.filter((item) => item.current >= item.goal).length} / {accountAchievements.length} открыто</span>
              </div>
              <div className="achievement-grid">
                {accountAchievements.map((achievement) => {
                  const unlocked = achievement.current >= achievement.goal;
                  const achievementProgress = Math.min(100, Math.round((achievement.current / achievement.goal) * 100));
                  const celebrating = newAchievementAnimations.includes(achievement.title);
                  return (
                    <article className={`achievement-card ${unlocked ? "unlocked" : ""} ${celebrating ? "achievement-celebration" : ""}`} key={achievement.title}>
                      {celebrating && <span className="achievement-sparkles" aria-hidden="true">✦ ✺ ✧ ✦ ✺</span>}
                      <span className="achievement-icon">{achievement.icon}</span>
                      <div className={celebrating ? "achievement-copy achievement-copy-float" : "achievement-copy"}>
                        <strong>{achievement.title}</strong>
                        <p>{achievement.text}</p>
                        <div className="achievement-progress"><i style={{ width: `${achievementProgress}%` }} /></div>
                        <small>{Math.min(achievement.current, achievement.goal)} / {achievement.goal}</small>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>
        </section>
      )}

      {screen === "analytics" && isLibraryOwner && (
        <section className="analytics-page">
          <div className="analytics-heading">
            <div><span className="account-eyebrow">ТОЛЬКО ДЛЯ РАЗРАБОТЧИКА</span><h1>Аналитика сайта</h1><p>Посещения, активность пользователей и использование карт без тяжёлых сторонних счётчиков.</p></div>
            <div className="analytics-periods">
              {[[7, "7 дней"], [30, "30 дней"], [90, "90 дней"], [365, "Год"]].map(([days, label]) => (
                <button type="button" className={analyticsPeriod === days ? "active" : ""} key={days} onClick={() => setAnalyticsPeriod(days)}>{label}</button>
              ))}
            </div>
          </div>
          {analyticsLoading ? <p className="analytics-empty">Собираем статистику…</p> : analyticsError ? <p className="analytics-empty error">{analyticsError}</p> : analyticsData ? (() => {
            const summary = analyticsData.summary || {};
            const daily = analyticsData.daily || [];
            const maxViews = Math.max(1, ...daily.map((day) => Number(day.views) || 0));
            const duration = Number(summary.active_seconds) || 0;
            const durationText = duration >= 3600 ? `${Math.floor(duration / 3600)} ч ${Math.floor(duration % 3600 / 60)} мин` : `${Math.floor(duration / 60)} мин`;
            const countryNames = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(["ru"], { type: "region" }) : null;
            const screenNames = { home: "Главная", maps: "Мои карты", editor: "Редактор", account: "Личный кабинет", library: "Библиотека", auth: "Вход" };
            const cards = [
              ["Уникальные посетители", summary.unique_visitors || 0, "Разные браузеры за период"],
              ["Сеансы", summary.sessions || 0, "Отдельные посещения сайта"],
              ["Просмотры страниц", summary.page_views || 0, "Переходы между разделами"],
              ["Активное время", durationText, "Время с открытой активной вкладкой"],
              ["Авторизованные", summary.authenticated_users || 0, "Пользователи, вошедшие в аккаунт"],
              ["Создано карт", summary.maps_created || 0, `Удалено: ${summary.maps_deleted || 0}`],
              ["Создано клеток", summary.cells_created || 0, "Объём новых карт"],
              ["Закрашено клеток", summary.cells_painted || 0, "Все завершённые штрихи"],
              ["Стёрто клеток", summary.cells_erased || 0, "Исправления пользователей"],
              ["Обращения", summary.feedback_sent || 0, "Отправлено через обратную связь"],
              ["Предложено эскизов", summary.library_submissions || 0, "Заявки в общую библиотеку"],
            ];
            return <>
              <div className="analytics-summary">{cards.map(([label, value, hint]) => <article key={label}><span>{label}</span><strong>{typeof value === "number" ? value.toLocaleString("ru-RU") : value}</strong><small>{hint}</small></article>)}</div>
              <section className="analytics-panel"><div className="analytics-panel-heading"><div><span className="account-eyebrow">ДИНАМИКА</span><h2>Посещения по дням</h2></div></div>
                {daily.length ? <div className="analytics-chart">{daily.map((day) => <div className="analytics-day" key={day.day}><i style={{ height: `${Math.max(4, (Number(day.views) || 0) / maxViews * 100)}%` }} title={`${day.views} просмотров`} /><strong>{day.visitors}</strong><span>{new Date(`${day.day}T00:00:00`).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}</span></div>)}</div> : <p className="analytics-empty">Данные начнут появляться после новых посещений.</p>}
              </section>
              <div className="analytics-columns">
                <section className="analytics-panel"><div className="analytics-panel-heading"><div><span className="account-eyebrow">ГЕОГРАФИЯ</span><h2>Страны</h2></div></div><div className="analytics-table">{(analyticsData.countries || []).map((row) => <div key={row.country}><strong>{row.country === "XX" ? "Не определена" : countryNames?.of(row.country) || row.country}</strong><span>{row.visitors} посетителей · {row.views} просмотров</span></div>)}</div></section>
                <section className="analytics-panel"><div className="analytics-panel-heading"><div><span className="account-eyebrow">ИНТЕРЕС</span><h2>Разделы сайта</h2></div></div><div className="analytics-table">{(analyticsData.screens || []).map((row) => <div key={row.screen}><strong>{screenNames[row.screen] || row.screen}</strong><span>{row.views} просмотров</span></div>)}</div></section>
              </div>
              <p className="analytics-note">Статистика начала собираться после установки этого раздела. Ваши действия в аккаунте разработчика не учитываются.</p>
            </>;
          })() : <p className="analytics-empty">Статистика пока пуста.</p>}
        </section>
      )}

      {screen === "feedback-inbox" && isLibraryOwner && (
        <section className="feedback-inbox-page">
          <div className="feedback-inbox-heading">
            <div>
              <span className="account-eyebrow">ОБРАЩЕНИЯ</span>
              <h1>Сообщения пользователей</h1>
              <p>Отзывы, вопросы и сообщения об ошибках из формы обратной связи.</p>
            </div>
            <span>{feedbackMessages.length}</span>
          </div>
          <div className="feedback-inbox-sections" role="tablist" aria-label="Тип входящих сообщений">
            <button type="button" className={feedbackInboxSection === "messages" ? "active" : ""} onClick={() => { setFeedbackInboxSection("messages"); setFeedbackInboxFilter("all"); setFeedbackSelectedIds([]); }}>
              Обращения <span>{feedbackMessages.filter((message) => message.kind !== "Эскиз в общую библиотеку").length}</span>
            </button>
            <button type="button" className={feedbackInboxSection === "sketches" ? "active" : ""} onClick={() => { setFeedbackInboxSection("sketches"); setFeedbackInboxFilter("all"); setFeedbackSelectedIds([]); }}>
              Эскизы в библиотеку <span>{feedbackMessages.filter((message) => message.kind === "Эскиз в общую библиотеку").length}</span>
            </button>
          </div>
          <div className="feedback-inbox-filters" role="tablist" aria-label="Фильтр обращений">
            {feedbackFilters.map((filter) => (
              <button
                type="button"
                role="tab"
                aria-selected={feedbackInboxFilter === filter.key}
                className={`${feedbackInboxFilter === filter.key ? "active " : ""}filter-${filter.key}`}
                key={filter.key}
                onClick={() => { setFeedbackInboxFilter(filter.key); setFeedbackSelectedIds([]); }}
              >
                {filter.title}<span>{filter.count}</span>
              </button>
            ))}
          </div>
          {!!visibleFeedbackMessages.length && (
            <div className="feedback-bulk-actions">
              <label>
                <input
                  type="checkbox"
                  checked={visibleFeedbackMessages.every((message) => feedbackSelectedIds.includes(message.id))}
                  onChange={(event) => setFeedbackSelectedIds(event.target.checked ? visibleFeedbackMessages.map((message) => message.id) : [])}
                />
                Выбрать все показанные
              </label>
              <button
                type="button"
                disabled={!feedbackSelectedIds.length}
                onClick={() => openFeedbackDeleteModal(feedbackMessages.filter((message) => feedbackSelectedIds.includes(message.id)))}
              >
                Удалить выбранные{feedbackSelectedIds.length ? ` (${feedbackSelectedIds.length})` : ""}
              </button>
            </div>
          )}
          {feedbackInboxLoading ? (
            <p className="feedback-inbox-empty">Загружаем сообщения…</p>
          ) : sectionFeedbackMessages.length ? (
            visibleFeedbackMessages.length ? (
              <div className="feedback-inbox-list" key={feedbackInboxFilter}>
              {visibleFeedbackMessages.map((message) => {
                const workStatus = message.work_status || "new";
                const replyEmail = message.reply_email || "";
                return (
                  <article id={`feedback-message-${message.id}`} className={`feedback-inbox-card status-${workStatus}${feedbackDeletingIds.includes(message.id) ? " is-deleting" : ""}${feedbackSelectedIds.includes(message.id) ? " is-selected" : ""}`} key={message.id}>
                  <div className="feedback-inbox-meta">
                    <label className="feedback-select-message">
                      <input
                        type="checkbox"
                        checked={feedbackSelectedIds.includes(message.id)}
                        onChange={(event) => setFeedbackSelectedIds((ids) => event.target.checked ? [...new Set([...ids, message.id])] : ids.filter((id) => id !== message.id))}
                      />
                      <strong>{message.kind}</strong>
                    </label>
                    <div className="feedback-inbox-meta-actions">
                      <time>{new Date(message.created_at).toLocaleString("ru-RU")}</time>
                      <button type="button" onClick={() => openFeedbackDeleteModal([message])}>Удалить</button>
                    </div>
                  </div>
                  <p>{message.message}</p>
                  {message.submission_data && (() => {
                    const submittedMaps = Array.isArray(message.submission_data.maps)
                      ? message.submission_data.maps
                      : [message.submission_data];
                    return (
                      <div className="submission-preview-grid">
                        {submittedMaps.map((submission, index) => {
                          const submittedMap = normalizeMap(submission);
                          const submittedDimensions = getGridDimensions(submittedMap.totalCells, submittedMap.imageRatio, submittedMap.gridMode, submittedMap.manualRows, submittedMap.manualCols);
                          return (
                            <div className="submission-preview-card" key={submittedMap.id || index}>
                              <div className="library-preview"><MapCardGrid map={submittedMap} dimensions={submittedDimensions} cropToDrawing previewBounds={{ width: 138, height: 118 }} /></div>
                              <div><strong>{submittedMap.name}</strong><span>{submittedMap.completed.length} {cellWord(submittedMap.completed.length)}</span></div>
                              <div className="submission-preview-actions">
                                <button type="button" disabled={Boolean(submission.approved_library_id)} onClick={() => editLibrarySubmission(message, index)}>Доработать</button>
                                <button type="button" disabled={Boolean(submission.approved_library_id)} onClick={() => approveLibrarySubmission(message, index)}>
                                  {submission.approved_library_id ? "Уже добавлен" : "Добавить в общую библиотеку"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                  <div className="feedback-inbox-contact">
                    <span>Отправитель: {message.sender_email || "не указан"}</span>
                    <span>
                      Для ответа: {replyEmail ? (
                        <a href={getYandexReplyUrl(message)} target="_blank" rel="noreferrer">
                          {replyEmail}
                        </a>
                      ) : "не указан"}
                    </span>
                  </div>
                  {!!message.attachments?.length && (
                    <div className="feedback-inbox-attachments">
                      {message.attachments.map((attachment, index) => (
                        <button type="button" key={`${message.id}-${attachment.path || index}`} onClick={() => openFeedbackAttachment(attachment)}>
                          📎 {attachment.name || `Вложение ${index + 1}`}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="feedback-workspace">
                    <div className="feedback-work-status" aria-label="Статус обращения">
                      {[["new", "Не обработано"], ["in_progress", "В работе"], ["done", "Готово"]].map(([value, label]) => (
                        <button
                          type="button"
                          className={workStatus === value ? "active" : ""}
                          key={value}
                          onClick={() => updateFeedbackAdminField(message.id, { work_status: value })}
                        >
                          <i aria-hidden="true" /> {label}
                        </button>
                      ))}
                    </div>
                    <label className="feedback-owner-note">
                      <span>Личная заметка</span>
                      <textarea
                        value={feedbackNoteDrafts[message.id] ?? message.owner_note ?? ""}
                        placeholder="Например: проверил ошибку, осталось подготовить ответ"
                        onChange={(event) => setFeedbackNoteDrafts((drafts) => ({ ...drafts, [message.id]: event.target.value }))}
                      />
                    </label>
                    <div className="feedback-note-actions">
                      <span className={`feedback-admin-state ${feedbackAdminState[message.id] || ""}`}>
                        {feedbackAdminState[message.id] === "saving" ? "Сохраняем…" : feedbackAdminState[message.id] === "saved" ? "Сохранено" : feedbackAdminState[message.id] === "error" ? "Не удалось сохранить" : ""}
                      </span>
                      <button type="button" onClick={() => updateFeedbackAdminField(message.id, { owner_note: feedbackNoteDrafts[message.id] ?? "" })}>Сохранить заметку</button>
                    </div>
                  </div>
                  </article>
                );
              })}
              </div>
            ) : (
              <p className="feedback-inbox-group-empty">В этом разделе пока нет обращений.</p>
            )
          ) : (
            <p className="feedback-inbox-empty">Новых обращений пока нет.</p>
          )}
        </section>
      )}

      {screen === "library" && (
        <section className="library-page">
          <div className="library-heading">
            <div>
              <span className="account-eyebrow">БИБЛИОТЕКА РИСУНКОВ</span>
              <h1>Готовые идеи и личные эскизы</h1>
              <p>Выберите готовый рисунок из общей коллекции или сохраните собственный эскиз для будущих карт.</p>
            </div>
          </div>

          <section className="library-section">
            <div className="account-section-title">
              <div><span className="account-eyebrow">ДЛЯ ВСЕХ</span><h2>Публичная коллекция</h2></div>
              <span>Пользователи могут отправить готовый эскиз на рассмотрение.</span>
            </div>
            {!isLibraryOwner && !!maps.length && (
              <button type="button" className="library-submit-sketch" onClick={() => { setSketchSubmissionMapIds(maps[0]?.id ? [maps[0].id] : []); setSketchSubmissionStatus(""); setIsSketchSubmissionClosing(false); setIsSketchSubmissionOpen(true); }}>
                Предложить свой эскиз
              </button>
            )}
            {isLibraryOwner && !!maps.length && (
              <div className="library-save-list library-public-save-list">
                {maps.map((map) => <button type="button" key={map.id} onClick={() => saveMapToPublicLibrary(map)}>+ Добавить «{map.name}» для всех</button>)}
              </div>
            )}
            {!!libraryStatus && <p className="library-status" role="status">{libraryStatus}</p>}
            <div className="library-discovery">
              <label className="library-search"><span>Поиск</span><input type="search" value={librarySearch} placeholder="Название или категория" onChange={(event) => setLibrarySearch(event.target.value)} /></label>
              <div className="library-order"><span>Порядок</span><AnimatedSelect value={librarySort} onChange={setLibrarySort} ariaLabel="Порядок эскизов" options={[{ value: "popular", label: "Популярные" }, { value: "new", label: "Новые" }, { value: "name", label: "По алфавиту" }, { value: "favorites", label: "Избранное" }]} /></div>
            </div>
            <div className="library-collections" role="group" aria-label="Коллекции">
              {libraryCategories.map((category) => <button type="button" key={category} className={libraryCategory === category ? "active" : ""} onClick={() => setLibraryCategory(category)}>{category}</button>)}
              {isLibraryOwner && (!isLibraryCategoryAdding ? (
                  <button type="button" className="library-add-category" onClick={() => { setNewCategoryDraft(""); setIsLibraryCategoryAdding(true); }}>+ Добавить категорию</button>
                ) : (
                  <form className="library-category-create" onSubmit={(event) => { event.preventDefault(); addCustomCategory("library"); }}>
                    <input autoFocus value={newCategoryDraft} maxLength={36} placeholder="Название категории" onChange={(event) => setNewCategoryDraft(event.target.value)} />
                    <button type="submit" disabled={!newCategoryDraft.trim()}>Добавить</button>
                    <button type="button" className="library-category-cancel" aria-label="Отменить добавление категории" onClick={() => { setNewCategoryDraft(""); setIsLibraryCategoryAdding(false); }}>×</button>
                  </form>
                ))}
            </div>
            <div className="library-grid">
              {visiblePublicLibrary.map((item) => {
                const dimensions = getGridDimensions(item.totalCells, 1, item.gridMode, item.manualRows, item.manualCols);
                return (
                  <article className="library-card" key={item.id} data-library-item-id={item.id}>
                    <button type="button" className={`library-favorite${libraryFavorites.includes(item.id) ? " active" : ""}`} aria-label={libraryFavorites.includes(item.id) ? "Убрать из избранного" : "Добавить в избранное"} aria-pressed={libraryFavorites.includes(item.id)} title={libraryFavorites.includes(item.id) ? "В избранном" : "Добавить в избранное"} onClick={(event) => { event.stopPropagation(); toggleLibraryFavorite(item.id); }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.2 10.6 19C5.7 14.7 2.5 11.8 2.5 8.2 2.5 5.3 4.8 3 7.7 3c1.6 0 3.2.8 4.3 2 1.1-1.2 2.7-2 4.3-2 2.9 0 5.2 2.3 5.2 5.2 0 3.6-3.2 6.5-8.1 10.8L12 20.2Z" /></svg></button>
                    <div className="library-preview"><MapCardGrid map={item} dimensions={dimensions} cropToDrawing /></div>
                    <div><strong>{item.name}</strong><span>{item.completed.length} {cellWord(item.completed.length)}</span></div>
                    <small>Использовали для своих карт: {item.useCount !== null && item.useCount !== undefined ? Number(item.useCount) || 0 : Number(libraryUsage[item.id]) || 0}</small>
                    <div className={`library-card-actions${isLibraryOwner ? " owner" : " single"}`}>
                      <button type="button" onClick={() => createMapFromLibrary(item)}>Создать карту</button>
                      {isLibraryOwner && <button type="button" className="edit-action" onClick={() => editPublicLibraryItem(item)}>Изменить</button>}
                      {isLibraryOwner && <button type="button" className="danger-action" onClick={() => removePublicLibraryItem(item)}>Удалить</button>}
                    </div>
                  </article>
                );
              })}
            </div>
            {!visiblePublicLibrary.length && <p className="library-empty">По этому запросу эскизов пока нет.</p>}
          </section>

          <section className="library-section">
            <div className="account-section-title">
              <div><span className="account-eyebrow">ТОЛЬКО ДЛЯ ВАС</span><h2>Личная библиотека</h2></div>
              <span>Сохраняйте сюда свои рисунки и используйте их повторно</span>
            </div>
            {!!maps.length && (
              <div className="library-save-list">
                {maps.map((map) => <button type="button" key={map.id} onClick={() => saveMapToLibrary(map)}>+ {map.name}</button>)}
              </div>
            )}
            {personalLibrary.length ? (
              <div className="library-grid">
                {personalLibrary.map((item) => {
                  const dimensions = getGridDimensions(item.totalCells, item.imageRatio, item.gridMode, item.manualRows, item.manualCols);
                  return (
                    <article className="library-card" key={item.id}>
                      <div className="library-preview"><MapCardGrid map={item} dimensions={dimensions} cropToDrawing /></div>
                      <div><strong>{item.name}</strong><span>{item.completed.length} {cellWord(item.completed.length)}</span></div>
                      <div className="library-card-actions">
                        <button type="button" onClick={() => createMapFromLibrary(item)}>Создать карту</button>
                        <button type="button" className="danger-action" onClick={() => removeLibraryItem(item.id)}>Удалить</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : <p className="library-empty">Добавьте сюда одну из своих карт — она останется только в вашей личной коллекции.</p>}
          </section>
        </section>
      )}

      {screen === "maps" && (
        <section className={`maps-page${authLoading || mapsLoading || !isMapInitialized ? " is-loading" : " is-ready"}${pendingDeletes.length ? " has-delete-undo" : ""}`}>
          <div className="maps-page-header">
            <div>
              <h1>
                {t("myMaps")}
              </h1>
            </div>

            <div className="maps-page-actions">
              {!!maps.length && (
                <div className="maps-view-switch" role="group" aria-label="Количество карточек в ряду">
                  <span>Карточек в строке</span>
                  <div className="maps-view-options" style={{ "--map-column-index": mapColumns - 1 }}>
                    <i aria-hidden="true" />
                    {[1, 2, 3, 4].map((columns) => (
                      <button
                        type="button"
                        key={columns}
                        className={mapColumns === columns ? "active" : ""}
                        aria-pressed={mapColumns === columns}
                        aria-label={`${columns} ${columns === 1 ? "карточка" : "карточки"} в ряду`}
                        onClick={() => changeMapColumns(columns)}
                      >{columns}</button>
                    ))}
                  </div>
                </div>
              )}
              <button
                className="save-map-btn"
                onClick={openCreateModal}
              >
                + {t("newMap")}
              </button>
            </div>
          </div>

          {authLoading || mapsLoading || !isMapInitialized ? (
            <div className="maps-loading-placeholder" aria-label="Загружаем карты">
              {Array.from({ length: 3 }, (_, index) => (
                <div className="maps-loading-card" key={index}>
                  <i />
                  <span><b /><b /></span>
                </div>
              ))}
            </div>
          ) : !maps.length ? (
            <div className="empty-maps">
              <div className="empty-maps-grid">
                {Array.from(
                  {
                    length: 36,
                  },
                  (_, i) => (
                    <span
                      key={i}
                      className={
                        i % 7 === 0 ||
                        i % 11 === 0 ||
                        [
                          16,
                          17,
                          23,
                          24,
                        ].includes(
                          i
                        )
                          ? "filled"
                          : ""
                      }
                    />
                  )
                )}
              </div>

              <span className="empty-maps-label">
                MM
              </span>

              <h2>
                {t(
                  "mapsEmpty"
                )}
              </h2>

              <p>
                {t("heroText")}
              </p>

              <button
                className="save-map-btn"
                onClick={
                  openCreateModal
                }
              >
                +{" "}
                {t(
                  "createMap"
                )}
              </button>
            </div>
          ) : (
            <>
              <div className="maps-filter" role="group" aria-label="Фильтр карт">
                {["Все", ...allCategories].map((category) => (
                  <button
                    key={category}
                    data-category={category}
                    className={`${mapCategoryFilter === category ? "active" : ""}${categoryDrag?.category === category ? " is-dragging" : ""}${categoryDrag?.target === category && categoryDrag.category !== category ? " is-drop-target" : ""}`}
                    onPointerDown={category === "Все" ? undefined : (event) => beginCategoryDrag(event, category)}
                    onClick={() => {
                      if (suppressCategoryClick.current) return;
                      setMapCategoryFilter(category);
                    }}
                    style={{ transform: categoryDragTransform(category) }}
                  >{category}</button>
                ))}
              </div>
            <p className="maps-drag-hint">Перетаскивайте карты и категории, чтобы менять их порядок.</p>
            {mapActionError && <p className="field-error" role="alert">{mapActionError}</p>}
            <div className={`maps-list maps-list-columns-${mapColumns}${cardSettling ? " is-reordering" : ""}`} style={{ "--map-columns": mapColumns }}>
              {cardDrag?.dropRect && <div className="map-drop-indicator" aria-hidden="true" style={cardDrag.dropRect} />}
              {[...maps].sort((a, b) => a.order - b.order).filter((map) => mapCategoryFilter === "Все" || map.category === mapCategoryFilter).map(
                (map) => {
                  const d =
                    getGridDimensions(
                      Math.max(
                        1,
                        Number(
                          map.totalCells
                        ) || 1
                      ),
                      map.imageRatio ||
                        1,
                      map.gridMode,
                      map.manualRows,
                      map.manualCols
                    );

                  const { filled: done, total: playableTotal, percent: p } = getMapStats(map);
                  const plan = adaptiveDailyTarget(map, todayDate);
                  const dailyProgress = getDailyPlanProgress(map, playableTotal, done, todayDate);
                  const planDoneToday = dailyPlanCompleted(map, playableTotal, done, todayDate);

                  return (
                    <article
                      className={`map-card${deletingIds.includes(map.id) ? " is-deleting" : ""}${restoredMapIds.includes(map.id) ? " is-restored" : ""}${cardDrag?.id === map.id ? " is-dragging" : ""}${cardSettling?.id === map.id ? " is-settling" : ""}${planDoneToday ? " daily-plan-complete" : ""}${p >= 100 ? " is-complete" : ""}`}
                      data-map-id={map.id}
                      tabIndex={0}
                      aria-label={`Карта: ${map.name}`}
                      onPointerDown={(event) => beginCardDrag(event, map.id)}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget || !event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
                        event.preventDefault();
                        const ordered = [...maps].sort((a, b) => a.order - b.order).filter((item) => mapCategoryFilter === "Все" || item.category === mapCategoryFilter);
                        const index = ordered.findIndex((item) => item.id === map.id);
                        const next = ordered[index + (event.key === "ArrowUp" ? -1 : 1)];
                        if (next) reorderCards(map.id, next.id);
                      }}
                      style={cardDrag?.id === map.id ? { transform: `translate3d(${cardDrag.dx}px, ${cardDrag.dy}px, 0) rotate(1deg)` } : undefined}
                      key={
                        map.id
                      }
                      onClick={() => {
                        if (suppressCardClick.current || deletingIdsRef.current.has(map.id)) return;
                        openMapFromList(map);
                      }}
                      >
                      {deletingIds.includes(map.id) && <div className="card-debris" aria-hidden="true">{Array.from({ length: 24 }, (_, i) => <i key={i} style={{ "--x": (i % 6) * 20 + "%", "--y": Math.floor(i / 6) * 30 + "%", "--dx": ((i * 37) % 180 - 90) + "px", "--dy": (40 + i * 7) + "px", "--turn": (i * 47) + "deg" }} />)}</div>}
                      <div className="map-card-preview">
                        <MapCardGrid map={map} dimensions={d} />
                      </div>

                      <div className="map-card-body">
                        <div className="map-card-heading">
                          <div>
                            <strong>
                              {
                                map.name
                              }
                            </strong>

                            <span>
                              {map.mapType ===
                              "image"
                                ? t(
                                    "imageMap"
                                  )
                                : t(
                                    "freeDrawing"
                                  )}
                            </span>
                            {map.description && (
                              <span className="map-card-description">
                                {map.description}
                              </span>
                            )}
                            {plan && <span className={`daily-plan${planDoneToday ? " completed" : ""}${plan.paused ? " paused" : ""}`}>
                              {planDoneToday && <><b>✓ План на сегодня выполнен</b><small>Отличный темп — можно продолжить или отдохнуть</small></>}
                              <span className="daily-plan-target">
                                {plan.paused
                                  ? plan.label
                                  : dailyProgress
                                  ? `Норма: ${dailyProgress.target} ${cellWord(dailyProgress.target)} в день · сегодня ${dailyProgress.paintedToday} из ${dailyProgress.target} · осталось ${plan.days} дн.`
                                  : `Норма: ${plan.label}`}
                              </span>
                            </span>}
                            <span className="map-card-meta">
                              <span>{map.category || "Личное"}</span>
                              {map.deadline && <span>Срок до {map.deadline.split("-").reverse().join(".")}</span>}
                              {map.createdAt && <span>Создана {new Date(map.createdAt).toLocaleDateString("ru-RU")}</span>}
                            </span>
                            {map.lastPaintedAt && (
                              <span className="map-card-updated">
                                Последнее изменение: {new Date(map.lastPaintedAt).toLocaleString("ru-RU", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  second: "2-digit",
                                })}
                              </span>
                            )}
                          </div>

                          <strong className="map-card-percent">
                            <AnimatedPercent value={p} />
                          </strong>
                        </div>

                        <div className="map-card-progress">
                          <i
                            style={{
                              width: `${p}%`,
                              backgroundColor: `hsl(${Math.round(p * 1.2)} 62% 43%)`,
                            }}
                          />
                        </div>

                        <div className="map-card-footer">
                          <span>
                            {done} /{" "}
                            {playableTotal}{" "}
                            {t(
                              "cells"
                            )}
                          </span>

                          <div className="map-card-actions">
                            <button
                              className="tool-btn"
                              onClick={(
                                e
                              ) => {
                                e.stopPropagation();

                                openMapFromList(map);
                              }}
                            >
                              {t(
                                "open"
                              )}
                            </button>

                            <button
                              className="tool-btn"
                              onClick={(
                                e
                              ) => {
                                e.stopPropagation();

                                openRenameModal(
                                  map
                                );
                              }}
                            >
                              {t(
                                "edit"
                              )}
                            </button>

                            <button
                              className="tool-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                openHistoryModal(map);
                              }}
                            >
                              История
                            </button>

                            <button
                              className="tool-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                openShareDialog(map);
                                setShareProgressVisible(true);
                                setShareActivityVisible(false);
                                setShareStatus("");
                              }}
                            >
                              Поделиться
                            </button>

                            <button
                              className="tool-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                setClosingModal("");
                                setDownloadChoice({ type: "stored", map });
                              }}
                            >
                              ↓ Скачать
                            </button>

                            <button
                              className="tool-btn danger-action"
                              onClick={(
                                e
                              ) => {
                                e.stopPropagation();

                                openDeleteModal(
                                  map
                                );
                              }}
                            >
                              {t(
                                "delete"
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                }
              )}
            </div>
            </>
          )}
          <div className="delete-layout-spacer" aria-hidden="true" style={{ height: deleteCollapseHeight }} />
        </section>
      )}

      {screen === "editor" && (
        <main className="editor-layout">
          <aside className="left-sidebar">
            <section className="sidebar-section map-data-section">
              <div className="section-heading">
                {t("mapData")}
              </div>

              <label className="field-label">
                {t("name")}
              </label>

              <div className="map-select-control">
                <AnimatedSelect
                  ariaLabel={t("name")}
                  value={activeMapId || ""}
                  options={(publicLibraryDraft ? [publicLibraryDraft] : maps).filter((map) => {
                    const draftId = submissionEditContext?.draftId || publicLibraryEditContext?.draftId;
                    return !draftId || map.id === draftId;
                  }).map((map) => ({ value: map.id, label: map.name }))}
                  onChange={(id) => {
                    const map = maps.find((item) => item.id === id);
                    if (map) openMap(map);
                  }}
                />
              </div>

              {publicLibraryEditContext && (
                <>
                  <label className="field-label library-category-label">Категория</label>
                  <div className="map-select-control">
                    <AnimatedSelect
                      ariaLabel="Категория эскиза"
                      value={publicLibraryCategoryDraft}
                      options={publicLibraryCategoryOptions.map((category) => ({ value: category, label: category }))}
                      onChange={setPublicLibraryCategoryDraft}
                    />
                  </div>
                </>
              )}

              <div className="map-actions">
                {submissionEditContext ? (
                  <>
                    <button className="text-action submission-save-action" disabled={submissionEditStatus === "saving"} onClick={() => finishSubmissionEditing("save")}>
                      {submissionEditStatus === "saving" ? "Сохраняем…" : "Сохранить доработку"}
                    </button>
                    <button className="text-action submission-publish-action" disabled={submissionEditStatus === "saving"} onClick={() => finishSubmissionEditing("publish")}>
                      Добавить в общую библиотеку
                    </button>
                    <button className="text-action" disabled={submissionEditStatus === "saving"} onClick={() => finishSubmissionEditing(false)}>Отменить</button>
                    {submissionEditStatus === "error" && <span className="field-error">Не удалось сохранить доработку</span>}
                  </>
                ) : publicLibraryEditContext ? (
                  <>
                    <button className="text-action submission-save-action" disabled={publicLibraryEditStatus === "saving"} onClick={() => finishPublicLibraryEditing(true)}>
                      {publicLibraryEditStatus === "saving" ? "Сохраняем…" : "Сохранить в библиотеке"}
                    </button>
                    <button className="text-action" disabled={publicLibraryEditStatus === "saving"} onClick={() => finishPublicLibraryEditing(false)}>Отменить</button>
                    {publicLibraryEditStatus === "error" && <span className="field-error">Не удалось сохранить рисунок</span>}
                  </>
                ) : (
                  <>
                    <button className="text-action" onClick={openCreateModal}>+ {t("new")}</button>
                    {activeMap && <>
                    <button
                      className="text-action"
                      onClick={() =>
                        openRenameModal(
                          activeMap
                        )
                      }
                    >
                      {t(
                        "edit"
                      )}
                    </button>

                    <button className="text-action" onClick={() => openHistoryModal(activeMap)}>
                      История
                    </button>
                    <button className="text-action" onClick={() => openShareDialog(activeMap)}>
                      Поделиться
                    </button>

                    <button
                      className="text-action danger-action"
                      onClick={() =>
                        openDeleteModal(
                          activeMap
                        )
                      }
                    >
                      {t(
                        "delete"
                      )}
                    </button>
                    </>}
                  </>
                )}
              </div>
            </section>

            <section className="sidebar-section">
              <div className="section-heading">
                {t(
                  "canvasSize"
                )}
              </div>

              <div className="segmented-control">
                <button
                  className={`map-type-btn ${
                    gridMode ===
                    "auto"
                      ? "active"
                      : ""
                  }`}
                  onClick={() =>
                    handleGridModeChange(
                      "auto"
                    )
                  }
                >
                  {t("auto")}
                </button>

                <button
                  className={`map-type-btn ${
                    gridMode ===
                    "manual"
                      ? "active"
                      : ""
                  }`}
                  onClick={() =>
                    handleGridModeChange(
                      "manual"
                    )
                  }
                >
                  {t(
                    "manual"
                  )}
                </button>
              </div>

              {gridMode ===
              "auto" ? (
                <div className="compact-field">
                  <label>
                    {language === "ru" ? "Клеток" : t("cells")}
                  </label>

                  <GridNumberInput
                    type="number"
                    min="1"
                    value={totalCells}
                    onChange={handleTotalCellsChange}
                  />
                </div>
              ) : (
                <div className="manual-grid-controls compact-grid-fields">
                  <div className="compact-field">
                    <label>
                      {t(
                        "rows"
                      )}
                    </label>

                    <GridNumberInput
                      type="number"
                      min="1"
                      value={
                        manualRows
                      }
                      onChange={
                        handleManualRowsChange
                      }
                      aria-label="Количество строк"
                    />
                  </div>
                  <div className="grid-side-choice" role="group" aria-label="Сторона изменения строк">
                    <div>
                      <button type="button" aria-pressed={rowAddSide === "top"} onClick={() => setRowAddSide("top")}>Сверху</button>
                      <button type="button" aria-pressed={rowAddSide === "bottom"} onClick={() => setRowAddSide("bottom")}>Снизу</button>
                    </div>
                  </div>

                  <div className="compact-field">
                    <label>
                      {t(
                        "columns"
                      )}
                    </label>

                    <GridNumberInput
                      type="number"
                      min="1"
                      value={
                        manualCols
                      }
                      onChange={
                        handleManualColsChange
                      }
                      aria-label="Количество столбцов"
                    />
                  </div>
                  <div className="grid-side-choice" role="group" aria-label="Сторона изменения столбцов">
                    <div>
                      <button type="button" aria-pressed={colAddSide === "left"} onClick={() => setColAddSide("left")}>Слева</button>
                      <button type="button" aria-pressed={colAddSide === "right"} onClick={() => setColAddSide("right")}>Справа</button>
                    </div>
                  </div>

                  <div
                    className="cells-stepper"
                    style={{
                      marginTop: "10px",
                      width: "100%",
                      boxSizing: "border-box",
                    }}
                  >
                    <label
                      className="cells-stepper-label"
                      style={{
                        display: "block",
                        marginBottom: "6px",
                      }}
                    >
                      {language === "ru" ? "Клеток" : t("cells")}
                    </label>

                    <div
                      className="cells-stepper-controls"
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "30px 30px minmax(66px, 1fr) 30px 30px",
                        alignItems: "center",
                        gap: "3px",
                        width: "100%",
                        minHeight: "40px",
                        padding: "3px",
                        border:
                          "1px solid #d8d0c5",
                        borderRadius: "11px",
                        background: "#fffdf9",
                        boxSizing: "border-box",
                      }}
                    >
                      {[
                        ["‹‹", -100, "-100"],
                        ["‹", -10, "-10"],
                      ].map(
                        ([symbol, delta, label]) => (
                          <button
                            key={label}
                            type="button"
                            className="tool-btn"
                            aria-label={label}
                            title={label}
                            onClick={() =>
                              changeTotalCells(delta)
                            }
                            style={{
                              width: "30px",
                              minWidth: "30px",
                              height: "34px",
                              padding: 0,
                              display: "grid",
                              placeItems: "center",
                              fontSize: "18px",
                              lineHeight: 1,
                            }}
                          >
                            {symbol}
                          </button>
                        )
                      )}

                      <GridNumberInput
                        type="number"
                        min="1"
                        aria-label={language === "ru" ? "Количество клеток" : t("cells")}
                        value={totalCells}
                        onChange={handleManualTotalCellsChange}
                        style={{
                          textAlign: "center",
                          fontSize: "14px",
                          fontWeight: 700,
                          color: "#252824",
                          width: "100%",
                          minWidth: 0,
                          height: "34px",
                          padding: "0 4px",
                          border: "1px solid #d8d0c5",
                          borderRadius: "7px",
                          background: "#fff",
                        }}
                      />

                      {[
                        ["›", 10, "+10"],
                        ["››", 100, "+100"],
                      ].map(
                        ([symbol, delta, label]) => (
                          <button
                            key={label}
                            type="button"
                            className="tool-btn"
                            aria-label={label}
                            title={label}
                            onClick={() =>
                              changeTotalCells(delta)
                            }
                            style={{
                              width: "30px",
                              minWidth: "30px",
                              height: "34px",
                              padding: 0,
                              display: "grid",
                              placeItems: "center",
                              fontSize: "18px",
                              lineHeight: 1,
                            }}
                          >
                            {symbol}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              )}

              {gridError && <p className="field-error" role="alert">{gridError}</p>}
              <div className="grid-info">
                {t("grid")}{" "}
                {rows} ×{" "}
                {cols} ·{" "}
                {actualTotal}{" "}
                {language === "ru" ? cellWord(actualTotal) : t("cells")}
              </div>
              {actualTotal % cols !== 0 && (
                <p className="grid-fill-hint">
                  Необязательно: добавьте ещё <strong>{cols - (actualTotal % cols)}</strong> {cellWord(cols - (actualTotal % cols))}, чтобы полностью заполнить последнюю строку.
                </p>
              )}
            </section>

            <section className="sidebar-section">
              <div className="section-heading">
                {t("tools")}
              </div>

              <div className="tool-stack">
                {!isGameMode && <button className={`map-type-btn ${selectionTool ? "active" : ""}`} aria-pressed={selectionTool} onClick={() => { setSelectionTool(!selectionTool); setSelection(null); }}>Выделение</button>}
                <div className="map-type tool-type">
                  <button
                    className={`map-type-btn ${
                      mapType ===
                      "free"
                        ? "active"
                        : ""
                    }`}
                    onClick={() =>
                      handleMapTypeChange(
                        "free"
                      )
                    }
                  >
                    {t(
                      "brush"
                    )}
                  </button>

                  <button
                    className={`map-type-btn ${
                      mapType ===
                      "image"
                        ? "active"
                        : ""
                    }`}
                    onClick={() =>
                      handleMapTypeChange(
                        "image"
                      )
                    }
                  >
                    {t(
                      "image"
                    )}
                  </button>
                  </div>

                  <>
                    <div className="map-mode-switch" role="group" aria-label="Режим карты">
                      <button className={!isGameMode ? "active" : ""} onClick={() => setIsGameMode(false)}>Рисование</button>
                      <button
                        className={isGameMode ? "active" : ""}
                        disabled={mapType === "free" ? !completed.length : !image}
                        onClick={() => {
                          if (mapType === "image" && !progressCompletedRef.current.size && completedRef.current.size) {
                            progressCompletedRef.current = new Set(completedRef.current);
                            setProgressCompleted([...completedRef.current]);
                          }
                          setSelection(null);
                          setSelectionTool(false);
                          setIsGameMode(true);
                        }}
                      >
                        Игра
                      </button>
                    </div>
                    {isGameMode && (
                      <div className="game-fill-control">
                        <button className="game-fill-btn" onClick={() => setIsGameFillOpen((open) => !open)}>
                          Заполнить клетки
                        </button>
                        {isGameFillOpen && (
                          <div className="game-fill-inline">
                            <label>Сколько <input type="number" min="1" value={gameFillCount} onChange={(event) => setGameFillCount(event.target.value)} /></label>
                            <div>
                              <button type="button" className={!gameFillRandom ? "active" : ""} onClick={() => setGameFillRandom(false)}>По порядку</button>
                              <button type="button" className={gameFillRandom ? "active" : ""} onClick={() => setGameFillRandom(true)}>Хаотично</button>
                            </div>
                            <button type="button" className="game-fill-apply" onClick={fillGameCells}>Заполнить</button>
                          </div>
                        )}
                      </div>
                    )}
                  </>

                  <div className="tool-actions">
                  <button
                    className="tool-btn"
                    onClick={
                      undo
                    }
                  >
                    <span className="tool-action-icon" aria-hidden="true">↶</span>
                    <span>{t("undo")}</span>
                  </button>

                  <button
                    className="tool-btn"
                    onClick={
                      redo
                    }
                  >
                    <span className="tool-action-icon" aria-hidden="true">↷</span>
                    <span>{t("redo")}</span>
                  </button>
                </div>

                {mapType ===
                  "image" && (
                  <>
                    <label className="image-upload-btn">
                      {image
                        ? t(
                            "replaceImage"
                          )
                        : t(
                            "uploadImage"
                          )}

                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={
                          handleImageChange
                        }
                      />
                    </label>

                    {image && (
                      <>
                        <label className="image-toggle">
                          <input
                            type="checkbox"
                            checked={
                              showImage
                            }
                            onChange={(
                              e
                            ) =>
                              setShowImage(
                                e
                                  .target
                                  .checked
                              )
                            }
                          />{" "}
                          {t(
                            "showImage"
                          )}
                        </label>

                        <button
                          className="tool-btn"
                          onClick={
                            clearImage
                          }
                        >
                          {t(
                            "clearImage"
                          )}
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            </section>

            {mapType === "free" && !isGameMode && (
              <section className="sidebar-section palette-section">
                <div className="section-heading">
                  {t(
                    "palette"
                  )}
                </div>

                <div className="color-palette">
                  <div className="color-palette-header">
                    <div>
                      <div className="color-palette-title">
                        {t(
                          "brushColor"
                        )}
                      </div>

                      <div className="color-palette-subtitle">
                        {t(
                          "newCells"
                        )}
                      </div>
                    </div>

                    <div
                      className="selected-color-preview"
                      style={{
                        backgroundColor:
                          drawColor,
                      }}
                    />
                  </div>

                  <div className="color-list">
                    {BASIC_COLORS.filter((color) => color !== UTILITY_COLOR).map(
                      (c) => (
                        <button
                          key={c}
                          className={`color-item ${
                            drawColor ===
                            c
                              ? "selected"
                              : ""
                          } ${
                            c ===
                            "#ffffff"
                              ? "white"
                              : ""
                          }`}
                          title={c}
                          onClick={() =>
                            selectDrawColor(
                              c
                            )
                          }
                          style={{
                            "--color":
                              c,
                          }}
                        >
                          <span className="color-dot" />
                        </button>
                      )
                    )}
                  </div>

                  {customColors.length >
                    0 && (
                    <div className="color-palette-section">
                      <div className="color-palette-label">
                        {t(
                          "myColors"
                        )}
                      </div>

                      <div className="color-list">
                        {customColors.map(
                          (c) => (
                            <div
                              key={c}
                              className="custom-color-wrapper"
                              onContextMenu={(
                                e
                              ) => {
                                e.preventDefault();

                                deleteCustomColor(
                                  c
                                );
                              }}
                            >
                              <button
                                className={`color-item ${
                                  drawColor ===
                                  c
                                    ? "selected"
                                    : ""
                                }`}
                                title={
                                  c
                                }
                                onClick={() =>
                                  selectDrawColor(
                                    c
                                  )
                                }
                                style={{
                                  "--color":
                                    c,
                                }}
                              >
                                <span className="color-dot" />
                              </button>

                              <button
                                className="delete-color-btn"
                                onClick={() =>
                                  deleteCustomColor(
                                    c
                                  )
                                }
                              >
                                ×
                              </button>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}

                  <div className="utility-color-section">
                    <div className="utility-color-copy">
                      <strong>Служебные клетки</strong>
                      <span>Добавляют клетки к количеству карты, когда в рисунке для них уже нет подходящего места. В списке «Мои карты» они выглядят как пустой фон.</span>
                    </div>
                    <button
                      className={`color-item utility-color${drawColor === UTILITY_COLOR ? " selected" : ""}`}
                      title={`${UTILITY_COLOR} — служебные клетки`}
                      onClick={() => selectDrawColor(UTILITY_COLOR)}
                      style={{ "--color": UTILITY_COLOR }}
                    >
                      <span className="color-dot" />
                    </button>
                  </div>

                  <div className="custom-color-create">
                    <label className="color-picker-wrap" htmlFor="new-color-picker">
                      <input
                        id="new-color-picker"
                        type="color"
                        value={
                          normalizeHexColor(newColor) || "#111111"
                        }
                        onChange={(
                          e
                        ) =>
                          setNewColor(
                            e.target
                              .value
                          )
                        }
                      />

                      <span className="color-picker-value">
                        {newColor.toUpperCase()}
                      </span>
                    </label>

                    <button
                      disabled={!normalizeHexColor(newColor)}
                      className="add-color-btn"
                      onClick={
                        addCustomColor
                      }
                    >
                      + Добавить цвет
                    </button>
                  </div>
                </div>
              </section>
            )}
          </aside>

          <section className="workspace">
            <div className="workspace-meta">
              <div>
                <span className="workspace-type">
                  {mapType ===
                  "image"
                    ? t(
                        "imageMap"
                      )
                    : t(
                        "freeDrawing"
                      )}
                </span>

                <h1>
                  {activeMap?.name ||
                    t(
                      "newMap"
                    )}
                </h1>
              </div>

              <span className="painted-count">
                {displayedCompleted.length}{" "}
                /{" "}
                {displayedTotal}{" "}
                {t("cells")}
              </span>
            </div>

            <div className="canvas-card">
              <div className="map-zoom-toolbar">
                <button
                  className="tool-btn"
                  onClick={() =>
                    setMapZoom(
                      (z) =>
                        Math.max(
                          0.5,
                          +(
                            z -
                            0.1
                          ).toFixed(
                            1
                          )
                        )
                    )
                  }
                >
                  −
                </button>

                <span>
                  {Math.round(
                    mapZoom *
                      100
                  )}
                  %
                </span>

                <button
                  className="tool-btn"
                  onClick={() =>
                    setMapZoom(
                      (z) =>
                        Math.min(
                          4,
                          +(
                            z +
                            0.1
                          ).toFixed(
                            1
                          )
                        )
                    )
                  }
                >
                  +
                </button>

                <button
                  className="tool-btn"
                  onClick={() =>
                    setMapZoom(1)
                  }
                >
                  100%
                </button>
              </div>

              <div
                className="grid-viewport"
                ref={
                  viewportRef
                }
                onScroll={handleEditorViewportScroll}
              >
                <div
                  className="grid-zoom-stage"
                  style={{ width: viewportSize.width + canvasWidth, height: viewportSize.height + canvasHeight }}
                >
                  <div
                    className={`grid-container${movingArtwork ? " moving-artwork" : ""}`}
                    style={{ width: canvasWidth, height: canvasHeight, flex: "0 0 auto" }}

                    onContextMenu={(
                      e
                    ) =>
                      e.preventDefault()
                    }
                  >
                    <canvas
                      ref={
                        canvasRef
                      }
                    className="grid-canvas"
                      tabIndex={0}
                      aria-label="Поле рисования"
                      style={{
                        touchAction:
                          "none",
                      }}
                      onPointerDown={
                        handlePointerDown
                      }
                      onPointerMove={
                        handlePointerMove
                      }
                      onPointerUp={
                        handlePointerUp
                      }
                      onPointerCancel={handlePointerCancel}
                      onLostPointerCapture={handlePointerCancel}
                      onContextMenu={(
                        e
                      ) =>
                        e.preventDefault()
                      }
                    />
                    {selection && !isGameMode && <div className={`grid-selection${selectionReady && !movingArtwork ? " selection-ready" : ""}`} style={{ left: `${selection.x / cols * 100}%`, top: `${selection.y / rows * 100}%`, width: `${selection.width / cols * 100}%`, height: `${selection.height / rows * 100}%` }}>{selectionReady && !movingArtwork && <span>Можно перемещать</span>}</div>}
                  </div>
                </div>
              </div>
            </div>

            {strokeCounter && createPortal(<span className="stroke-counter" style={{ left: strokeCounter.x + 12, top: strokeCounter.y + 12 }}>{strokeCounter.count}</span>, document.body)}
            <div className="drawing-hint">
              {t(
                "drawHint"
              )} · Ctrl+Z / Ctrl+Y · Ctrl + колесо — масштаб · WASD / стрелки — перемещение · ПКМ по пустой клетке — перемещение · Ctrl + ЛКМ — выделить область, затем перетащить её · Esc — снять выделение
            </div>
          </section>

          <aside className="right-sidebar">
            <section className="sidebar-section preview-panel">
              <div className="section-heading">
                {t(
                  "preview"
                )}
              </div>

              <div
                className="mini-preview"
                style={{
                  gridTemplateColumns: `repeat(${cols},minmax(0,1fr))`,
                  aspectRatio: `${cols}/${rows}`,
                }}
              >
                {Array.from(
                  {
                    length:
                      actualTotal,
                  },
                  (_, i) => {
                    const active = isGameMode
                      ? progressSet.has(i) && (mapType === "image" || drawingSet.has(i))
                      : mapType === "free" && drawingSet.has(i);

                    const color =
                      colors[i] ||
                      "#e5e5e5";
                    const utilityCell = mapType === "free" && normalizeHexColor(colors[i]) === UTILITY_COLOR;

                    const showGuide = (mapType === "image" && showImage && image)
                      || (isGameMode && mapType === "free" && drawingSet.has(i));
                    return (
                      <span
                        key={i}
                        className={cellAnimationsRef.current.has(i) ? "cell-pop" : ""}
                        style={{
                          backgroundColor: utilityCell
                            ? "#eeeeea"
                            : active
                            ? color
                            : showGuide
                              ? color
                              : "#eeeeea",
                          opacity: utilityCell ? 1 : !active && showGuide ? (!isGameMode && mapType === "image" ? 0.35 : 0.2) : 1,
                        }}
                      />
                    );
                  }
                )}
              </div>

              {dailyPlan && <p className={`daily-plan${dailyPlan.paused ? " paused" : ""}`} aria-live="polite">{dailyPlan.label}</p>}
              <div className="preview-progress">
                <strong>
                  <AnimatedPercent value={displayedProgress} />
                </strong>

                <span>
                  {t(
                    "filled"
                  )}
                </span>
              </div>

              <div className="preview-bar">
                <i
                  style={{
                    width: `${displayedProgress}%`,
                  }}
                />
              </div>

              <div className="preview-stat">
                <span>
                  {t(
                    "painted"
                  )}{" "}
                  {t("cells")}
                </span>

                <strong>
                  {
                    displayedCompleted.length
                  }
                </strong>
              </div>

              <div className="preview-stat">
                <span>
                  {t(
                    "total"
                  )}{" "}
                  {t("cells")}
                </span>

                <strong>
                  {displayedTotal}
                </strong>
              </div>

              {isGameMode && (
                <div className="milestone-list" aria-label="Вехи карты">
                  {[25, 50, 75, 100].map((milestone) => (
                    <span key={milestone} className={displayedProgress >= milestone ? "reached" : ""}>{displayedProgress >= milestone ? "✦" : "○"} {milestone}%</span>
                  ))}
                </div>
              )}

              <button
                className="clear-btn"
                onClick={
                  clearProgress
                }
              >
                {t(
                  "clearProgress"
                )}
              </button>
            </section>
          </aside>
        </main>
      )}

      {screen === "maps" && !!pendingDeletes.length && (() => {
        const latest = pendingDeletes[0];
        const remainingMs = Math.max(0, latest.deadline - deleteCountdownNow);
        return (
          <div className="delete-undo-bar map-delete-undo" role="status">
            <div className="delete-undo-copy">
              <span>Карта «{latest.map.name}» удалена</span>
              <strong>{Math.max(1, Math.ceil(remainingMs / 1000))} сек.</strong>
              <button type="button" onClick={() => void restoreLastDeletedMap()}>Отменить</button>
            </div>
            <i><b style={{ width: `${remainingMs / 50}%` }} /></i>
          </div>
        );
      })()}

      {isCreateOpen && (
        <div
          className={`modal-overlay${closingModal === "create" ? " is-closing" : ""}`}
          onMouseDown={() => closeModal("create")}
        >
          <form
            className="create-modal"
            onSubmit={(event) => {
              event.preventDefault();
              createMap();
            }}
            onMouseDown={(e) =>
              e.stopPropagation()
            }
          >
            <div className="modal-header">
              <h2>
                {t("newMap")}
              </h2>

              <button
                type="button"
                className="modal-close"
                onClick={() => closeModal("create")}
              >
                ×
              </button>
            </div>

            <div className="modal-field">
              <label>
                {t("name")}
              </label>

              <input
                type="text"
                autoFocus
                value={
                  newMapName
                }
                onChange={(e) =>
                  setNewMapName(
                    e.target
                      .value
                  )
                }
              />
            </div>

            <div className="modal-field">
              <label>{t("mapDescription")}</label>
              <textarea
                value={newMapDescription}
                placeholder="Можешь написать, для чего тебе эта карта — например, «30 тренировок» или «Мой путь к цели»."
                onChange={(e) => setNewMapDescription(e.target.value)}
              />
            </div>

            <div className="modal-inline-fields">
              <div className="modal-field">
                <label>Категория</label>
                <AnimatedSelect
                  ariaLabel="Категория"
                  value={newMapCategory}
                  onChange={setNewMapCategory}
                  options={[...allCategories, { value: "__custom__", label: "Своя категория…" }]}
                />
              </div>
              <DeadlinePicker value={newMapDeadline} onChange={setNewMapDeadline} optional />
            </div>

            {newMapCategory === "__custom__" && (
              <div className="category-create">
                <input autoFocus value={newCategoryDraft} placeholder="Например, Финансы" onChange={(event) => setNewCategoryDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCustomCategory("create"); } }} />
                <button type="button" onClick={() => addCustomCategory("create")}>Добавить</button>
              </div>
            )}

            <div className="modal-field">
              <label>
                {t("mapType")}
              </label>

              <div className="modal-map-types">
                <button
                  type="button"
                  className={`map-type-btn ${
                    newMapType ===
                    "image"
                      ? "active"
                      : ""
                  }`}
                  onClick={() =>
                    setNewMapType(
                      "image"
                    )
                  }
                >
                  {t("image")}
                </button>

                <button
                  type="button"
                  className={`map-type-btn ${
                    newMapType ===
                    "free"
                      ? "active"
                      : ""
                  }`}
                  onClick={() =>
                    setNewMapType(
                      "free"
                    )
                  }
                >
                  {t(
                    "freeDrawing"
                  )}
                </button>
              </div>
            </div>

            <div className="modal-field">
              <label>
                {t("grid")}
              </label>

              <div className="modal-map-types">
                <button
                  type="button"
                  className={`map-type-btn ${
                    newMapGridMode ===
                    "auto"
                      ? "active"
                      : ""
                  }`}
                  onClick={() =>
                    setNewMapGridMode(
                      "auto"
                    )
                  }
                >
                  {t("auto")}
                </button>

                <button
                  type="button"
                  className={`map-type-btn ${
                    newMapGridMode ===
                    "manual"
                      ? "active"
                      : ""
                  }`}
                  onClick={() =>
                    setNewMapGridMode(
                      "manual"
                    )
                  }
                >
                  {t(
                    "manual"
                  )}
                </button>
              </div>
            </div>

            {newMapGridMode ===
            "auto" ? (
              <div className="modal-field">
                <label>
                  {t(
                    "cells"
                  )}
                </label>

                <div className="map-cells-control">
                  <button type="button" aria-label="Уменьшить количество клеток" onPointerDown={(event) => { event.preventDefault(); startMapCellsHold(-1); }} onPointerUp={stopMapCellsHold} onPointerLeave={stopMapCellsHold} onPointerCancel={stopMapCellsHold}>−</button>
                  <input
                    className="map-cells-input"
                    type="number"
                    min="1"
                    value={newMapCells}
                    onChange={(e) => setNewMapCells(e.target.value)}
                  />
                  <button type="button" aria-label="Увеличить количество клеток" onPointerDown={(event) => { event.preventDefault(); startMapCellsHold(1); }} onPointerUp={stopMapCellsHold} onPointerLeave={stopMapCellsHold} onPointerCancel={stopMapCellsHold}>+</button>
                </div>
              </div>
            ) : (
              <div className="manual-grid-controls">
                <div className="modal-field">
                  <label>
                    {t(
                      "rows"
                    )}
                  </label>

                  <input
                    type="number"
                    min="1"
                    value={
                      newMapRows
                    }
                    onChange={(e) =>
                      setNewMapRows(
                        e.target
                          .value
                      )
                    }
                  />
                </div>

                <div className="modal-field">
                  <label>
                    {t(
                      "columns"
                    )}
                  </label>

                  <input
                    type="number"
                    min="1"
                    value={
                      newMapCols
                    }
                    onChange={(e) =>
                      setNewMapCols(
                        e.target
                          .value
                      )
                    }
                  />
                </div>
              </div>
            )}

            {newMapInvalid && <p className="field-error" role="alert">{newMapCount > MAX_CELLS ? "Лимит — 10000 клеток" : "Введите целое число от 1 до 10000"}</p>}
            <button
              type="submit"
              className="modal-create-btn"
              disabled={newMapInvalid}
            >
              {t(
                "createMap"
              )}
            </button>
          </form>
        </div>
      )}

      {isSketchSubmissionOpen && (
        <div className={`modal-overlay${isSketchSubmissionClosing ? " is-closing" : ""}`} onMouseDown={() => closeSketchSubmissionModal()}>
          <form className="create-modal sketch-submission-modal" onSubmit={submitLibrarySketch} onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header"><div><h2>Предложить эскизы</h2><p>Выберите одну или несколько карт. Рисунки и цвета попадут в заявку разработчику.</p></div><button type="button" className="modal-close" onClick={() => closeSketchSubmissionModal()}>×</button></div>
            <div className="modal-field">
              <label>Карты</label>
              <div className="sketch-map-options">
                {maps.map((map) => (
                  <label key={map.id} className={sketchSubmissionMapIds.includes(map.id) ? "selected" : ""}>
                    <input
                      type="checkbox"
                      checked={sketchSubmissionMapIds.includes(map.id)}
                      onChange={() => setSketchSubmissionMapIds((current) => current.includes(map.id) ? current.filter((id) => id !== map.id) : [...current, map.id])}
                    />
                    <span>{map.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="sketch-submission-previews">
              {maps.filter((map) => sketchSubmissionMapIds.includes(map.id)).map((selected) => {
                const dimensions = getGridDimensions(selected.totalCells, selected.imageRatio, selected.gridMode, selected.manualRows, selected.manualCols);
                return <div className="sketch-submission-preview" key={selected.id}><div className="library-preview"><MapCardGrid map={{ ...selected, progressCompleted: selected.completed }} dimensions={dimensions} cropToDrawing previewBounds={{ width: 168, height: 148 }} /></div><div><strong>{selected.name}</strong><span>{selected.completed.length} клеток в рисунке</span></div></div>;
              })}
            </div>
            <div className="modal-field"><label>Комментарий <span className="optional-label">необязательно</span></label><textarea rows="4" value={sketchSubmissionNote} placeholder="Например: рисунок для категории «Спорт»" onChange={(event) => setSketchSubmissionNote(event.target.value)} /></div>
            {sketchSubmissionStatus === "error" && <p className="feedback-result error">Не удалось отправить заявку. Попробуйте ещё раз.</p>}
            <button className="modal-create-btn" type="submit" disabled={!sketchSubmissionMapIds.length || sketchSubmissionStatus === "sending"}>{sketchSubmissionStatus === "sending" ? "Отправляем…" : sketchSubmissionStatus === "sent" ? "Заявка отправлена" : `Отправить на рассмотрение${sketchSubmissionMapIds.length > 1 ? ` (${sketchSubmissionMapIds.length})` : ""}`}</button>
          </form>
        </div>
      )}

      {isFeedbackOpen && (
        <div className={`modal-overlay${closingModal === "feedback" ? " is-closing" : ""}`} onMouseDown={() => closeModal("feedback")}>
          <form ref={feedbackModalRef} className="create-modal feedback-modal" onSubmit={submitFeedback} onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Обратная связь</h2>
                <p>Расскажите о предложении, ошибке или любой другой идее.</p>
              </div>
              <button type="button" className="modal-close" onClick={() => closeModal("feedback")}>×</button>
            </div>
            <div className="modal-field">
              <label>Тема</label>
              <AnimatedSelect
                ariaLabel="Тема обращения"
                value={feedbackKind}
                onChange={setFeedbackKind}
                options={["Предложение", "Ошибка на сайте", "Вопрос", "Другое"]}
              />
            </div>
            <div className="modal-field">
              <label>Сообщение</label>
              <textarea
                autoFocus
                required
                rows="7"
                value={feedbackMessage}
                placeholder="Опишите, что хотите предложить или что работает не так"
                onChange={(event) => { setFeedbackMessage(event.target.value); setFeedbackStatus(""); }}
              />
            </div>
            <div className="modal-field">
              <label>Email для ответа <span className="optional-label">необязательно</span></label>
              <input type="email" value={feedbackEmail} placeholder="name@example.com" onChange={(event) => setFeedbackEmail(event.target.value)} />
              <small className="feedback-email-hint">Укажите email, если хотите получить ответ на обращение.</small>
            </div>
            <div className="modal-field feedback-attachment-field">
              <label>Фото или видео <span className="optional-label">необязательно, до 50 МБ</span></label>
              <label className="feedback-file-picker">
                <input
                  ref={feedbackFileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  onChange={(event) => {
                    const files = Array.from(event.target.files || []);
                    const next = [...feedbackFiles];
                    files.forEach((file) => {
                      const duplicate = next.some((saved) => saved.name === file.name && saved.size === file.size && saved.lastModified === file.lastModified);
                      if (!duplicate) next.push(file);
                    });
                    setFeedbackFiles(next);
                    setFeedbackStatus(next.reduce((total, file) => total + file.size, 0) > FEEDBACK_MAX_BYTES ? "files-too-large" : "");
                    event.target.value = "";
                  }}
                />
                <span>{feedbackFiles.length ? `Добавить ещё файлы · выбрано ${feedbackFiles.length}` : "+ Прикрепить несколько файлов"}</span>
              </label>
              <div className={`feedback-file-list${feedbackFiles.length ? "" : " is-empty"}`}>
                  {feedbackFiles.map((file, index) => {
                    const fileKey = `${file.name}-${file.size}-${file.lastModified}`;
                    return (
                      <div className={`feedback-file-item${feedbackRemovingFile === fileKey ? " is-removing" : ""}`} key={fileKey}>
                        <span className="feedback-file-name" title={file.name} aria-label={file.name}>
                          {[...file.name].map((letter, letterIndex) => (
                            <i
                              aria-hidden="true"
                              key={letterIndex}
                              style={{
                                "--letter-index": letterIndex,
                                "--letter-x": `${((letterIndex * 37) % 19) - 9}px`,
                                "--letter-y": `${14 + (letterIndex % 5) * 4}px`,
                                "--letter-turn": `${((letterIndex * 29) % 70) - 35}deg`,
                              }}
                            >{letter === " " ? "\u00a0" : letter}</i>
                          ))}
                        </span>
                        <button
                          type="button"
                          aria-label={`Удалить файл ${file.name}`}
                          onClick={() => {
                            if (feedbackRemovingFile) return;
                            setFeedbackRemovingFile(fileKey);
                            window.setTimeout(() => {
                              setFeedbackFiles((current) => {
                                const next = current.filter((_, fileIndex) => fileIndex !== index);
                                setFeedbackStatus(next.reduce((total, saved) => total + saved.size, 0) > FEEDBACK_MAX_BYTES ? "files-too-large" : "");
                                return next;
                              });
                              setFeedbackRemovingFile("");
                            }, 400);
                          }}
                    >×</button>
                      </div>
                    );
                  })}
              </div>
            </div>
            {feedbackStatus === "error" && <p className="feedback-result error">Не удалось отправить. Попробуйте ещё раз чуть позже.</p>}
            {feedbackStatus === "files-too-large" && <p className="feedback-result error">Общий размер вложений не должен превышать 50 МБ.</p>}
            <button className="modal-create-btn" type="submit" disabled={!feedbackMessage.trim() || feedbackStatus === "sending" || feedbackStatus === "files-too-large"}>
              {feedbackStatus === "sending" ? "Отправляем…" : "Отправить"}
            </button>
          </form>
        </div>
      )}

      {accountToRemove && (
        <div className={`modal-overlay account-remove-overlay${isAccountRemoveClosing ? " is-closing" : ""}`} onMouseDown={closeAccountRemoveModal}>
          <div className="create-modal saved-account-remove-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Убрать аккаунт?</h2>
                <p><strong>{accountToRemove.name}</strong> исчезнет из быстрого переключения на этом устройстве.</p>
              </div>
              <button type="button" className="modal-close" onClick={closeAccountRemoveModal}>×</button>
            </div>
            <p className="saved-account-remove-note">Сам аккаунт, его карты и прогресс останутся сохранены. Его можно будет добавить снова через вход.</p>
            <div className="saved-account-remove-actions">
              <button type="button" onClick={closeAccountRemoveModal}>Отмена</button>
              <button type="button" className="danger-action" onClick={confirmRemoveSavedAccount}>Убрать</button>
            </div>
          </div>
        </div>
      )}

      {showFeedbackThanks && (
        <div className={`feedback-thanks-overlay${isFeedbackThanksClosing ? " is-closing" : ""}`} onMouseDown={closeFeedbackThanks}>
          <div className="feedback-thanks-card" role="status" onMouseDown={(event) => event.stopPropagation()}>
            <span aria-hidden="true">✓</span>
            <strong>Спасибо за сообщение!</strong>
            <p>Обращение отправлено.</p>
          </div>
        </div>
      )}

      {downloadChoice && (
        <div className={`modal-overlay${closingModal === "download" ? " is-closing" : ""}`} onMouseDown={() => closeModal("download")}>
          <div className="create-modal download-choice-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>Скачать карту</h2>
                <p>Выберите, как сохранить рисунок.</p>
              </div>
              <button type="button" className="modal-close" onClick={() => closeModal("download")}>×</button>
            </div>
            <div className="download-choice-actions">
              <button type="button" onClick={() => {
                if (downloadChoice.type === "current") downloadMap(true);
                else downloadStoredMap(downloadChoice.map, true);
                closeModal("download");
              }}>
                <span className="download-choice-icon with-grid" aria-hidden="true" />
                <strong>Оставить сетку</strong>
                <small>Границы клеток будут видны</small>
              </button>
              <button type="button" onClick={() => {
                if (downloadChoice.type === "current") downloadMap(false);
                else downloadStoredMap(downloadChoice.map, false);
                closeModal("download");
              }}>
                <span className="download-choice-icon without-grid" aria-hidden="true" />
                <strong>Убрать сетку</strong>
                <small>Чистый рисунок как в предпросмотре</small>
              </button>
            </div>
          </div>
        </div>
      )}

      {historyMap && (
        <div className={`modal-overlay feature-modal-overlay history-overlay${versionUndoNotice ? " has-version-undo" : ""}${historyClosing ? " is-closing" : ""}`} onMouseDown={closeHistoryModal}>
          <div className="create-modal history-modal" onMouseDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
            <div className="modal-header"><div><span className="account-eyebrow">ВСЕ ВЕРСИИ</span><h2>История «{historyMap.name}»</h2></div><button type="button" className="modal-close" onClick={closeHistoryModal}>×</button></div>
            <p className="feature-modal-intro">Автоматическая версия создаётся после каждого завершённого изменения. Историю можно сгруппировать по дням.</p>
            <div className={`history-view-switch is-${historyViewMode}`} role="group" aria-label="Отображение истории">
              <button type="button" className={historyViewMode === "changes" ? "active" : ""} onClick={() => changeHistoryViewMode("changes")}>Все изменения</button>
              <button type="button" className={historyViewMode === "days" ? "active" : ""} onClick={() => changeHistoryViewMode("days")}>По дням</button>
            </div>
            {featureStatus && <p className="feature-status" role="status">{featureStatus}</p>}
            <button type="button" className="feature-primary" onClick={() => saveMapVersion(historyMap)}>Сохранить текущую версию</button>
            {historyVersionEntries.length ? (() => {
              const selectedEntry = historyVersionEntries.find((entry) => entry.index === historyPreviewIndex) || historyVersionEntries.at(-1);
              const snapshot = selectedEntry.version;
              const preview = normalizeMap({ ...historyMap, ...snapshot });
              const dimensions = getGridDimensions(preview.totalCells, preview.imageRatio, preview.gridMode, preview.manualRows, preview.manualCols);
              const current = getMapStats(historyMap);
              const visiblePosition = Math.max(0, historyPlaybackEntries.findIndex((entry) => entry.index === selectedEntry.index));
              return <>
                <div className="history-preview"><div className="library-preview history-preview-map"><MapCardGrid map={preview} dimensions={dimensions} animateChanges animationKey={snapshot.id} showTemplate={historyPreviewMode === "template"} playbackActive={historyPlaying && visiblePosition > 0} playbackSpeedRef={historyPlaybackSpeedRef} /></div><div className="history-preview-copy"><strong>{snapshot.label}</strong><CrossfadeText value={new Date(snapshot.createdAt).toLocaleString("ru-RU")} /><CrossfadeText as="p" value={`${snapshot.filled} из ${snapshot.total} клеток · ${snapshot.filled - current.filled >= 0 ? "+" : ""}${snapshot.filled - current.filled} к текущей версии`} /><div className={`history-preview-mode is-${historyPreviewMode}`} role="group" aria-label="Вид воспроизведения"><button type="button" className={historyPreviewMode === "template" ? "active" : ""} onClick={() => changeHistoryPreviewMode("template")}>С фоном</button><button type="button" className={historyPreviewMode === "cells" ? "active" : ""} onClick={() => changeHistoryPreviewMode("cells")}>Только клетки</button></div></div></div>
                <div className="history-player">
                  <button type="button" onClick={() => {
                    if (historyPlaying) setHistoryPlaying(false);
                    else {
                      const startPosition = visiblePosition >= historyPlaybackEntries.length - 1 ? 0 : visiblePosition;
                      if (startPosition === 0) setHistoryPreviewIndex(historyPlaybackEntries[0].index);
                      historyPlaybackPositionRef.current = startPosition;
                      setHistoryPlaying(true);
                    }
                  }}>{historyPlaying ? "■ Остановить" : visiblePosition >= historyPlaybackEntries.length - 1 ? "▶ С начала" : "▶ Продолжить"}</button>
                  <div className={`history-timeline${historyPlaying ? " is-playing" : ""}`} style={{ "--history-progress": `${historyPlaybackEntries.length > 1 ? visiblePosition / (historyPlaybackEntries.length - 1) * 100 : 100}%` }}>
                    <i><b ref={historyTimelineFillRef} /></i>
                    <input className="history-range" aria-label="Положение в истории" type="range" min="0" max={historyPlaybackEntries.length - 1} value={visiblePosition} onChange={(event) => { const position = Number(event.target.value); setHistoryPlaying(false); historyPlaybackPositionRef.current = position; setHistoryPreviewIndex(historyPlaybackEntries[position].index); }} />
                  </div>
                  <span>{visiblePosition + 1} / {historyPlaybackEntries.length}</span>
                  <div className="history-speed" role="group" aria-label="Скорость воспроизведения">
                    {[0.5, 1, 1.5, 2, 4, 8, 16].map((speed) => <button type="button" key={speed} className={historyPlaybackSpeed === speed ? "active" : ""} onClick={() => changeHistoryPlaybackSpeed(speed)}>{String(speed).replace(".", ",")}×</button>)}
                  </div>
                </div>
                <div className="history-actions"><button type="button" className="feature-primary" onClick={() => restoreMapVersion(historyMap, snapshot)}>Восстановить эту версию</button></div>
                <div className="history-version-list" key={historyViewMode}>{[...historyVersionEntries].reverse().map(({ version, index }) => <div className={`history-version-row${index === selectedEntry.index ? " active" : ""}${deletingVersionId === version.id ? " is-deleting" : ""}${restoredVersionId === version.id ? " is-restored" : ""}`} key={version.id}><button type="button" className="history-version-select" onClick={() => { setHistoryPlaying(false); setHistoryPreviewIndex(index); }}><span>{version.label}</span><small>{new Date(version.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · {version.filled}/{version.total}</small></button><button type="button" className="history-version-delete" aria-label={`Удалить версию ${version.label}`} data-tooltip="Удалить версию" onClick={() => deleteMapVersion(historyMap, version)}><svg className="history-version-delete-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2L2 10" /></svg></button></div>)}</div>
              </>;
            })() : <p className="feature-empty">Версий пока нет. Внеси изменение в карту или сохрани важный этап вручную.</p>}
          </div>
          {versionUndoNotice && (() => {
            const remainingMs = Math.max(0, versionUndoNotice.deadline - deleteCountdownNow);
            return <div className={`delete-undo-bar version-undo-bar history-version-undo${versionUndoClosing ? " is-closing" : ""}`} role="status" onMouseDown={(event) => event.stopPropagation()}><div className="delete-undo-copy"><span>Версия «{versionUndoNotice.label}» удалена</span><strong>{Math.max(1, Math.ceil(remainingMs / 1000))} сек.</strong><button type="button" onClick={() => void undoDeletedVersion()}>Отменить</button></div><small>Позже её также можно вернуть сочетанием Ctrl+Z</small><i><b style={{ width: `${remainingMs / 50}%` }} /></i></div>;
          })()}
        </div>
      )}

      {shareMap && (
        <div className="modal-overlay feature-modal-overlay" onMouseDown={() => setShareMap(null)}>
          <div className="create-modal share-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header"><div><span className="account-eyebrow">ТОЛЬКО ПРОСМОТР</span><h2>Публичная ссылка</h2></div><button type="button" className="modal-close" onClick={() => setShareMap(null)}>×</button></div>
            <p className="feature-modal-intro">Посетитель увидит снимок карты и не сможет его изменить. Обнови ссылку повторно, чтобы показать свежую версию.</p>
            <label className="feature-toggle"><input type="checkbox" checked={shareProgressVisible} onChange={(event) => setShareProgressVisible(event.target.checked)} /><span>Показывать прогресс</span></label>
            <label className="feature-toggle"><input type="checkbox" checked={shareActivityVisible} onChange={(event) => setShareActivityVisible(event.target.checked)} /><span>Показывать дату последнего изменения</span></label>
            {shareMap.shareUrl && <div className="share-link"><input readOnly value={shareMap.shareUrl} /><button type="button" onClick={() => navigator.clipboard.writeText(shareMap.shareUrl)}>Копировать</button></div>}
            {shareStatus === "error" && <p className="feature-status error">Не удалось создать ссылку. Попробуй ещё раз.</p>}
            {shareStatus === "copied" && <p className="feature-status">Ссылка создана. Её можно скопировать из поля выше.</p>}
            {shareStatus === "portable" && <p className="feature-status">Создана автономная ссылка-снимок. Её нельзя отозвать или обновить: новая публикация создаст другую ссылку.</p>}
            <div className="history-actions"><button type="button" className="feature-primary" disabled={shareStatus === "saving"} onClick={publishShare}>{shareStatus === "saving" ? "Публикуем…" : shareMap.shareUrl ? "Обновить снимок" : "Создать и скопировать ссылку"}</button>{shareMap.shareId && <button type="button" className="danger-action" onClick={revokeShare}>Отключить ссылку</button>}</div>
          </div>
        </div>
      )}

      {onboardingOpen && (
        <div className="modal-overlay onboarding-overlay">
          <div className="create-modal onboarding-modal">
            <div className="onboarding-progress">{[0,1,2].map((step) => <i key={step} className={step <= onboardingStep ? "active" : ""} />)}</div>
            {onboardingStep === 0 && <><span className="onboarding-icon">□</span><h2>Добро пожаловать в Map Method</h2><p>Здесь большая цель превращается в карту: один выполненный шаг — одна закрашенная клетка.</p></>}
            {onboardingStep === 1 && <><span className="onboarding-icon">✦</span><h2>Двигайся в своём темпе</h2><p>Укажи срок и выбери спокойный, ровный или интенсивный режим. План будет пересчитываться сам.</p></>}
            {onboardingStep === 2 && <><span className="onboarding-icon">✓</span><h2>Попробуй на готовой карте</h2><p>Мы создадим небольшую демонстрационную карту. Её можно менять или удалить как обычную.</p></>}
            <div className="onboarding-actions">{onboardingStep > 0 && <button type="button" onClick={() => setOnboardingStep((step) => step - 1)}>Назад</button>}<button type="button" className="feature-primary" onClick={() => onboardingStep < 2 ? setOnboardingStep((step) => step + 1) : createDemoMap()}>{onboardingStep < 2 ? "Дальше" : "Создать демо-карту"}</button></div>
            <button type="button" className="onboarding-skip" onClick={finishOnboarding}>Пропустить</button>
          </div>
        </div>
      )}

      {isRenameOpen && (
        <div
          className={`modal-overlay${closingModal === "rename" ? " is-closing" : ""}`}
          onMouseDown={() => closeModal("rename")}
        >
          <div
            className="create-modal"
            onMouseDown={(e) =>
              e.stopPropagation()
            }
          >
            <div className="modal-header">
              <h2>
                {t(
                  "renameMap"
                )}
              </h2>

              <button
                className="modal-close"
                onClick={() => closeModal("rename")}
              >
                ×
              </button>
            </div>

            <div className="modal-field">
              <label>
                {t(
                  "newName"
                )}
              </label>

              <input
                type="text"
                autoFocus
                value={
                  renameValue
                }
                onChange={(e) =>
                  setRenameValue(
                    e.target
                      .value
                  )
                }
                onKeyDown={(e) =>
                  e.key ===
                    "Enter" &&
                  saveRename()
                }
              />
            </div>

            <div className="modal-field">
              <label>{t("mapDescription")}</label>
              <textarea
                value={renameDescription}
                placeholder="Коротко: для чего эта карта?"
                onChange={(e) => setRenameDescription(e.target.value)}
              />
            </div>

            <div className="modal-inline-fields">
              <div className="modal-field">
                <label>Категория</label>
                <AnimatedSelect
                  ariaLabel="Категория"
                  value={renameCategory}
                  onChange={setRenameCategory}
                  options={[...allCategories, { value: "__custom__", label: "Своя категория…" }]}
                />
              </div>
              <DeadlinePicker value={renameDeadline} onChange={setRenameDeadline} />
            </div>

            {renameCategory === "__custom__" && (
              <div className="category-create">
                <input autoFocus value={newCategoryDraft} placeholder="Например, Финансы" onChange={(event) => setNewCategoryDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addCustomCategory("rename")} />
                <button type="button" onClick={() => addCustomCategory("rename")}>Добавить</button>
              </div>
            )}

            <button
              className="modal-create-btn"
              onClick={
                saveRename
              }
            >
              {t("save")}
            </button>
          </div>
        </div>
      )}

      {!!feedbackDeleteTargets.length && (
        <div
          className={`modal-overlay${isFeedbackDeleteClosing ? " is-closing" : ""}`}
          onMouseDown={closeFeedbackDeleteModal}
        >
          <div className="create-modal delete-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>Удалить обращение?</h2>
              <button type="button" className="modal-close" onClick={closeFeedbackDeleteModal}>×</button>
            </div>
            <p className="delete-modal-text">
              {feedbackDeleteTargets.length === 1
                ? `Обращение «${feedbackDeleteTargets[0].kind}» и его вложения будут удалены без возможности восстановления.`
                : `${feedbackDeleteTargets.length} обращений и все их вложения будут удалены без возможности восстановления.`}
            </p>
            {feedbackDeleteError && <p className="feedback-result error">{feedbackDeleteError}</p>}
            <div className="delete-modal-actions">
              <button type="button" className="cancel-delete-btn" disabled={Boolean(feedbackDeletingIds.length)} onClick={closeFeedbackDeleteModal}>Отмена</button>
              <button type="button" className="confirm-delete-btn" disabled={Boolean(feedbackDeletingIds.length)} onClick={confirmDeleteFeedback}>
                {feedbackDeletingIds.length ? "Удаляем…" : "Удалить"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isDeleteOpen &&
        mapToDelete && (
          <div
            className={`modal-overlay${closingModal === "delete" ? " is-closing" : ""}`}
            onMouseDown={() => closeModal("delete")}
          >
            <div
              className="create-modal delete-modal"
              onMouseDown={(e) =>
                e.stopPropagation()
              }
            >
              <div className="modal-header">
                <h2>
                  {t(
                    "deleteMap"
                  )}
                </h2>

                <button
                  className="modal-close"
                  onClick={() => closeModal("delete")}
                >
                  ×
                </button>
              </div>

              <p className="delete-modal-text">
                <strong>«{mapToDelete.name}»</strong>
                <br />
                Это действие нельзя отменить: карта и весь её прогресс будут удалены.
              </p>

              <div className="delete-modal-actions">
                <button
                  className="cancel-delete-btn"
                  onClick={() => closeModal("delete")}
                >
                  {t(
                    "cancel"
                  )}
                </button>

                <button
                  className="confirm-delete-btn"
                  onClick={
                    confirmDeleteMap
                  }
                >
                  {t(
                    "delete"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
