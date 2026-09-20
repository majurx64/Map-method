import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { supabase } from "./lib/supabase";
import Auth from "./Auth";

const STORAGE_KEY = "mm-maps";
const ACTIVE_MAP_KEY = "mm-active-map";
const LANGUAGE_KEY = "mm-language";
const CURRENT_SCREEN_KEY = "mm-current-screen";
const CUSTOM_COLORS_KEY = "mm-custom-colors";
const CUSTOM_CATEGORIES_KEY = "mm-custom-categories";
const SCROLL_POSITIONS_KEY = "mm-scroll-positions";
const ACHIEVEMENT_SESSION_KEY = "mm-celebrated-achievements";

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
];

const MAP_CATEGORIES = ["Личное", "Здоровье", "Учёба", "Работа", "Творчество"];
const LANGUAGE_OPTIONS = [
  ["ru", "Русский"], ["en", "English"], ["es", "Español"], ["ja", "日本語"], ["de", "Deutsch"],
  ["fr", "Français"], ["it", "Italiano"], ["pt", "Português"], ["zh", "中文"], ["ko", "한국어"],
];

const DEMO_PYRAMID_ROWS = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27];
const DEMO_PYRAMID_TOTAL = DEMO_PYRAMID_ROWS.reduce((sum, count) => sum + count, 0);

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

function getActivityDate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
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
    .slice(-180)
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
  const custom = [
    ...new Set(
      (Array.isArray(map.customColors) ? map.customColors : [])
        .map(normalizeHexColor)
        .filter(Boolean)
        .filter((c) => !BASIC_COLORS.includes(c))
    ),
  ];

  return {
    id: map.id || createMapId(),
    name: typeof map.name === "string" ? map.name : "Моя карта",
    mapType: map.mapType === "image" ? "image" : "free",
    isGameMode: Boolean(map.isGameMode),
    gridMode: map.gridMode === "manual" ? "manual" : "auto",
    completed: [
      ...new Set(
        (Array.isArray(map.completed) ? map.completed : [])
          .map(Number)
          .filter(Number.isInteger)
          .filter((i) => i >= 0 && i < mapLimit)
      ),
    ],
    progressCompleted: [
      ...new Set(
        (Array.isArray(map.progressCompleted) ? map.progressCompleted : [])
          .map(Number)
          .filter(Number.isInteger)
          .filter((i) => i >= 0 && i < mapLimit)
      ),
    ],
    // Прогресс не должен выходить за пределы самой карты.
    progressExtra: 0,
    image: typeof map.image === "string" ? map.image : null,
    colors: Array.isArray(map.colors) ? map.colors : [],
    customColors: custom,
    drawColor: normalizeHexColor(map.drawColor) || BASIC_COLORS[0],
    imageRatio: Number(map.imageRatio) > 0 ? Number(map.imageRatio) : 1,
    totalCells:
      typeof map.totalCells === "string"
        ? map.totalCells
        : String(map.totalCells || 500),
    manualRows:
      typeof map.manualRows === "string"
        ? map.manualRows
        : String(map.manualRows || 20),
    manualCols:
      typeof map.manualCols === "string"
        ? map.manualCols
        : String(map.manualCols || 25),
    showImage:
      typeof map.showImage === "boolean" ? map.showImage : true,
    description:
      typeof map.description === "string" ? map.description : "",
    category: typeof map.category === "string" && map.category.trim().slice(0, 36) ? map.category.trim().slice(0, 36) : "Личное",
    deadline: /^\d{4}-\d{2}-\d{2}$/.test(map.deadline || "") ? map.deadline : "",
    activityLog: normalizeActivityLog(map.activityLog),
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
    id: row.id,
    name: row.name,
  });
}

function getGridDimensions(
  total,
  ratio = 1,
  gridMode = "auto",
  manualRows = 20,
  manualCols = 25
) {
  if (gridMode === "manual") {
    const rows = Math.max(1, Number(manualRows) || 1);
    const cols = Math.max(1, Number(manualCols) || 1);

    return {
      rows,
      cols,
      actualTotal: Math.min(
        rows * cols,
        Math.max(1, Number(total) || rows * cols)
      ),
    };
  }

  const cols = Math.max(
    1,
    Math.round(Math.sqrt(total * ratio))
  );

  const rows = Math.max(
    1,
    Math.ceil(total / cols)
  );

  return {
    rows,
    cols,
    actualTotal: rows * cols,
  };
}

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
  const rootRef = useRef(null);
  const normalizedOptions = options.map((option) => typeof option === "string" ? { value: option, label: option } : option);
  const selected = normalizedOptions.find((option) => String(option.value) === String(value));

  useEffect(() => {
    function closeOnOutsidePointer(event) {
      if (!rootRef.current?.contains(event.target)) setIsOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, []);

  return (
    <div className={`animated-select${isOpen ? " is-open" : ""}`} ref={rootRef}>
      <button type="button" className="animated-select-trigger" aria-label={ariaLabel} aria-expanded={isOpen} onClick={() => setIsOpen((open) => !open)}>
        <span>{selected?.label || placeholder}</span><i>⌄</i>
      </button>
      {isOpen && (
        <div className="animated-select-menu" role="listbox">
          {normalizedOptions.map((option) => (
            <button key={option.value} type="button" role="option" aria-selected={String(option.value) === String(value)} className={String(option.value) === String(value) ? "selected" : ""} onClick={() => { onChange(option.value); setIsOpen(false); }}>
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
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
    const saved = localStorage.getItem(CURRENT_SCREEN_KEY);

    return [
      "home",
      "maps",
      "editor",
      "account",
      "auth",
    ].includes(saved)
      ? saved
      : "home";
  });

  const [maps, setMaps] = useState(initial.maps);
  const [activeMapId, setActiveMapId] = useState(
    initial.activeMap
  );
  const [saveStatus, setSaveStatus] = useState("");
  const [heroDemoCells, setHeroDemoCells] = useState(
    () => new Set(Array.from({ length: 98 }, (_, index) => index * 2))
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

  const activeMap =
    maps.find((m) => m.id === activeMapId) || null;

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

  const [
    newMapName,
    setNewMapName,
  ] = useState("");
  const [newMapDescription, setNewMapDescription] = useState("");
  const [newMapCategory, setNewMapCategory] = useState("Личное");
  const [newMapDeadline, setNewMapDeadline] = useState("");
  const [newCategoryDraft, setNewCategoryDraft] = useState("");
  const [customCategories, setCustomCategories] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CUSTOM_CATEGORIES_KEY) || "[]").filter((item) => typeof item === "string"); }
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
  const [mapCategoryFilter, setMapCategoryFilter] = useState("Все");
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

  const allCategories = [...new Set([...MAP_CATEGORIES, ...customCategories])];

  const [
    isAccountOpen,
    setIsAccountOpen,
  ] = useState(false);
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);

  const canvasRef = useRef(null);
  const viewportRef = useRef(null);
  const accountRef = useRef(null);
  const demoPointerRef = useRef(null);
  const demoModeRef = useRef("draw");
  const heroNotePointerRef = useRef(null);
  const heroNoteModeRef = useRef("draw");
  const suppressContextMenuRef = useRef(false);
  const suppressHeroContextMenuRef = useRef(false);
  const wasGameCompleteRef = useRef(false);
  const wasDemoCompleteRef = useRef(false);
  const imageProcessingRef = useRef(0);
  const cellAnimationsRef = useRef(new Map());
  const cellAnimationTimerRef = useRef(null);
  const canvasAnimationFrameRef = useRef(null);

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

  const hydratingRef = useRef(true);
  const saveTimerRef = useRef(null);
  const remoteSaveQueueRef = useRef(Promise.resolve());
  const activeMapRef = useRef(activeMap);
  const hydrationReleaseTimerRef = useRef(null);
  const historyReadyRef = useRef(false);
  const historyNavigationRef = useRef(false);

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

  const progress = actualTotal
    ? Math.min(
        100,
        Math.round(
          (completed.length / actualTotal) * 100
        )
      )
    : 0;

  const isPlaying = isGameMode;
  const displayedCompleted = isPlaying
    ? progressCompleted
    : completed;
  const displayedTotal = isPlaying
    ? mapType === "image"
      ? actualTotal
      : completed.length
    : actualTotal;
  const displayedProgress = displayedTotal
    ? Math.min(100, Math.round((displayedCompleted.length / displayedTotal) * 100))
    : 0;

  const t = (key) =>
    additionalTranslations[language]?.[key] ??
    translations[language]?.[key] ??
    translations.ru[key] ??
    key;

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

  const accountInitial =
    accountName.trim().charAt(0).toUpperCase() || "M";

  const accountMapStats = maps.map((map) => {
    const dimensions = getGridDimensions(
      Math.max(1, Number(map.totalCells) || 1),
      map.imageRatio || 1,
      map.gridMode,
      map.manualRows,
      map.manualCols
    );
    // В статистике и в превью важен именно пройденный путь в игре,
    // а не контур, который был нарисован при создании карты.
    const filled = map.progressCompleted?.length || 0;

    return { ...map, total: dimensions.actualTotal, filled };
  });

  const accountPaintedCells = accountMapStats.reduce(
    (sum, map) => sum + map.filled,
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
    ? Math.round((accountPaintedCells / accountTotalCells) * 1000) / 10
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
    { icon: "●", title: "Первый шаг", text: "Закрасить 100 клеток", current: accountPaintedCells, goal: 100 },
    { icon: "◆", title: "Ритм", text: "Закрасить 200 клеток", current: accountPaintedCells, goal: 200 },
    { icon: "✺", title: "Большая картина", text: "Закрасить 500 клеток", current: accountPaintedCells, goal: 500 },
    { icon: "✹", title: "Тысяча шагов", text: "Закрасить 1 000 клеток", current: accountPaintedCells, goal: 1000 },
    { icon: "◉", title: "Масштаб", text: "Закрасить 2 000 клеток", current: accountPaintedCells, goal: 2000 },
    { icon: "✦", title: "Своя вселенная", text: "Закрасить 5 000 клеток", current: accountPaintedCells, goal: 5000 },
    { icon: "☼", title: "Ритм недели", text: "Закрасить клетки в 7 дней", current: accountHistory.filter((item) => item.cells > 0).length, goal: 7 },
    { icon: "♜", title: "Финиш", text: "Завершить 3 карты", current: accountFinishedMaps, goal: 3 },
  ];

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
    if (!historyReadyRef.current) {
      window.history.replaceState({ mapMethod: true, screen }, "", window.location.href);
      historyReadyRef.current = true;
      return;
    }
    if (historyNavigationRef.current) {
      historyNavigationRef.current = false;
      return;
    }
    window.history.pushState({ mapMethod: true, screen }, "", window.location.href);
  }, [screen]);

  useEffect(() => {
    const handlePopState = () => {
      // Стрелка «назад» внутри приложения всегда возвращает к списку карт,
      // а не выбрасывает пользователя на предыдущий сайт.
      historyNavigationRef.current = true;
      setScreen("maps");
      window.history.pushState({ mapMethod: true, screen: "maps" }, "", window.location.href);
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
    };
    // Восстанавливаем позицию только один раз. Повторные таймеры перехватывали
    // ручную прокрутку и иногда возвращали страницу наверх.
    const restoreTimers = [window.setTimeout(restore, 0)];
    const savePosition = () => {
      if (!restored) return;
      const next = JSON.parse(
        localStorage.getItem(SCROLL_POSITIONS_KEY) || "{}"
      );
      next[screen] = Math.max(
        window.scrollY,
        document.documentElement.scrollTop,
        document.body.scrollTop
      );
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

      if (isCreateOpen) {
        setIsCreateOpen(false);
        return;
      }

      if (isRenameOpen) {
        setIsRenameOpen(false);
        return;
      }

      if (isDeleteOpen) {
        setIsDeleteOpen(false);
        return;
      }

      if (isAccountOpen) {
        setIsAccountOpen(false);
        return;
      }
      if (isLanguageOpen) {
        setIsLanguageOpen(false);
        return;
      }

      if (screen === "editor") {
        setScreen("maps");
      } else if (["maps", "account", "auth"].includes(screen)) {
        setScreen("home");
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [screen, isCreateOpen, isRenameOpen, isDeleteOpen, isAccountOpen, isLanguageOpen]);

  useEffect(() => {
    if (!isMapInitialized) return;

    saveMapsLocally(maps);
  }, [maps, isMapInitialized]);

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
    const gameTotal = mapType === "image" ? actualTotal : completed.length;
    const complete = isGameMode && gameTotal > 0 && progressCompleted.length >= gameTotal;
    if (complete && !wasGameCompleteRef.current) {
      setShowVictory(true);
      window.setTimeout(() => setShowVictory(false), 3200);
    }
    wasGameCompleteRef.current = complete;
  }, [isGameMode, mapType, actualTotal, completed, progressCompleted]);

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

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setUser(data.session?.user || null);
        setAuthLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_e, session) => {
        if (mounted) {
          setUser(session?.user || null);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setMapsLoading(true);
      setIsMapInitialized(false);
      hydratingRef.current = true;

      if (!user) {
        if (!cancelled) {
          setMaps(initial.maps);
          setActiveMapId(initial.activeMap);

          const localActive =
            initial.maps.find(
              (m) => m.id === initial.activeMap
            ) || initial.maps[0];

          if (localActive) {
            openMap(localActive);
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

        return;
      }

      const {
        data,
        error,
      } = await supabase
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

      if (error) {
        console.error(error);

        loadedMaps = initial.maps;
        loadedActiveId = initial.activeMap;
      } else if (data?.length) {
        loadedMaps = data.map(mapFromSupabaseRow);

        const saved =
          localStorage.getItem(ACTIVE_MAP_KEY);

        loadedActiveId =
          loadedMaps.find(
            (m) => m.id === saved
          )?.id ||
          loadedMaps[0]?.id ||
          null;
      } else if (initial.maps.length) {
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
          : initial.maps;

        loadedActiveId =
          migrated[0]?.id ||
          initial.activeMap ||
          null;
      }

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
  }, [user]);

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
              ? next
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
    (map) => {
      if (!user || !map) {
        return Promise.resolve(null);
      }

      const run = async () => {
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
            console.error(
              "Ошибка автосохранения:",
              error
            );

            return error;
          }

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
    if (
      !isMapInitialized ||
      hydratingRef.current ||
      !activeMapId ||
      !user
    ) {
      return;
    }

    clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(() => {
      const map = buildCurrentMap();

      if (map) {
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
  ]);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (
        accountRef.current &&
        !accountRef.current.contains(e.target)
      ) {
        setIsAccountOpen(false);
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

  async function handleSignOut() {
    setIsAccountOpen(false);

    const { error } =
      await supabase.auth.signOut();

    if (error) {
      console.error(
        "Ошибка выхода:",
        error
      );

      return;
    }

    setScreen("home");
    localStorage.setItem(
      CURRENT_SCREEN_KEY,
      "home"
    );
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

  function pushHistory(
    before,
    after,
    beforeColors,
    afterColors,
    target = "drawing"
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
    });

    if (
      undoStackRef.current.length > 100
    ) {
      undoStackRef.current.shift();
    }
  }

  function setSnapshot(s, target = "drawing") {
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
    if (isDrawingRef.current) {
      return;
    }

    const a =
      undoStackRef.current.pop();

    if (!a) return;

    redoStackRef.current.push(a);
    setSnapshot(a.before, a.target);
  }

  function redo() {
    if (isDrawingRef.current) {
      return;
    }

    const a =
      redoStackRef.current.pop();

    if (!a) return;

    undoStackRef.current.push(a);
    setSnapshot(a.after, a.target);
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

    const date = getActivityDate();
    setActivityLog((previous) => {
      const next = normalizeActivityLog([
        ...previous,
        { date, cells: count },
      ]);
      activityLogRef.current = next;
      return next;
    });
  }

  function applyCells(indices, mode) {
    if (!indices?.length) return;

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
      progressCompletedRef.current = next;
      setProgressCompleted([...next]);
      if (mode === "draw") recordPaintedCells(changed.length);
      return;
    }

    const nextSet =
      new Set(completedRef.current);

    const nextColors =
      mapType === "free"
        ? [...colorsRef.current]
        : null;
    const changed = [];

    for (const i of indices) {
      if (mode === "draw") {
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
    completedRef.current = nextSet;
    setCompleted([...nextSet]);
    if (mode === "draw") recordPaintedCells(changed.length);

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

    isDrawingRef.current = false;
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

    // Браузер присылает contextmenu уже после pointerup. Запоминаем
    // именно ПКМ-штрих внутри холста, чтобы меню не всплывало снаружи.
    if (e.button === 2) suppressContextMenuRef.current = true;

    const i =
      getCellFromPointerEvent(e);

    if (i === null) return;

    const currentSet =
      isGameMode
        ? progressCompletedRef.current
        : completedRef.current;
    const mode = e.button === 2 || currentSet.has(i) ? "erase" : "draw";

    try {
      canvasRef.current?.setPointerCapture(
        e.pointerId
      );
    } catch {}

    startStroke(
      i,
      mode,
      e.pointerId
    );
  }

  function handlePointerMove(e) {
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
  }

  function handlePointerUp(e) {
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
    finishStroke();
  }

  function clearProgress() {
    finishStroke();

    if (isGameMode) {
      const before = new Set(progressCompletedRef.current);
      if (!before.size && !progressExtraRef.current) return;
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
      window.devicePixelRatio || 1;

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

    // На большом полотне цвета должны выглядеть так же живо, как в превью.
    ctx.filter = mapType === "image" ? "saturate(1.16) contrast(1.04)" : "none";

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
          ? colors[i] || "#e5e5e5"
          : "#e5e5e5";
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

      // Базовый цвет появляется сразу — быстрый штрих не даёт пустых клеток.
      ctx.fillStyle = fill;
      ctx.fillRect(
        x,
        y,
        cw + 0.5,
        ch + 0.5
      );

      // Поверх основы остаётся мягкий «пульс», поэтому анимация не исчезает.
      if (!isErasing && elapsed < 260) {
        ctx.globalAlpha = 0.2 * (1 - animationProgress);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(
          x + (cw * (1 - scale)) / 2,
          y + (ch * (1 - scale)) / 2,
          cw * scale + 0.5,
          ch * scale + 0.5
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
          cw + 0.5,
          ch + 0.5
        );

        ctx.globalAlpha = 1;
      }

      // При стирании фон появляется сразу под курсором, а прежний цвет
      // плавно сжимается поверх него — анимация есть, отставания нет.
      if (isErasing) {
        const eraseScale = 1 - animationProgress * 0.35;
        ctx.globalAlpha = 1 - animationProgress;
        ctx.fillStyle = animation.color || fill;
        ctx.fillRect(
          x + (cw * (1 - eraseScale)) / 2,
          y + (ch * (1 - eraseScale)) / 2,
          cw * eraseScale + 0.5,
          ch * eraseScale + 0.5
        );
        ctx.globalAlpha = 1;
      }
    }

    ctx.strokeStyle =
      "#d8d4cc";

    ctx.lineWidth = 1;

    for (
      let r = 0;
      r <= rows;
      r++
    ) {
      const y =
        Math.round(r * ch) +
        0.5;

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
      const x =
        Math.round(col * cw) +
        0.5;

      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(
        x,
        rect.height
      );
      ctx.stroke();
    }
  }

  useEffect(() => {
    if (screen !== "editor")
      return;

    const id =
      requestAnimationFrame(
        drawCanvas
      );

    return () =>
      cancelAnimationFrame(id);
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
    showImage,
    drawColor,
    mapZoom,
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
    showImage,
    drawColor,
  ]);

  useEffect(() => {
    if (screen !== "editor")
      return;

    const handleWheel = (e) => {
      if (!e.ctrlKey) return;

      const viewport =
        viewportRef.current;

      if (
        !viewport ||
        !viewport.contains(e.target)
      ) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      setMapZoom((z) => {
        const next =
          z +
          (e.deltaY < 0
            ? 0.1
            : -0.1);

        return Math.min(
          4,
          Math.max(
            0.5,
            Number(
              next.toFixed(1)
            )
          )
        );
      });
    };

    window.addEventListener(
      "wheel",
      handleWheel,
      {
        passive: false,
        capture: true,
      }
    );

    return () => {
      window.removeEventListener(
        "wheel",
        handleWheel,
        {
          capture: true,
        }
      );
    };
  }, [screen]);

  useEffect(() => {
    const f = (e) => {
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

    window.addEventListener(
      "keydown",
      f,
      true
    );

    return () =>
      window.removeEventListener(
        "keydown",
        f,
        true
      );
  });

  function processImage(
    dataUrl,
    ratio,
    targetCols = cols,
    targetRows = rows
  ) {
    const requestId = ++imageProcessingRef.current;
    const img =
      new Image();

    img.onload = () => {
      try {
        if (requestId !== imageProcessingRef.current) return;

        const off = document.createElement("canvas");
        const w = Math.max(1, Number(targetCols) || 1);
        const h = Math.max(1, Number(targetRows) || 1);

        off.width = w;
        off.height = h;

        const ctx = off.getContext("2d", {
          willReadFrequently: true,
        });

        if (!ctx) {
          throw new Error("Canvas недоступен для обработки изображения");
        }

        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        const next = [];

        for (let i = 0; i < w * h; i++) {
          const p = i * 4;
          next[i] = `rgb(${data[p]}, ${data[p + 1]}, ${data[p + 2]})`;
        }

        if (requestId === imageProcessingRef.current) {
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

        setImage(src);

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
          dimensions.rows
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
    finishStroke();

    setMapType(type);
    setIsGameMode(false);
    progressCompletedRef.current = new Set();
    setProgressCompleted([]);
    progressExtraRef.current = 0;
    setProgressExtra(0);

    setCompletedDirectly([]);

    colorsRef.current = [];
    setColors([]);

    clearHistory();

    if (type === "free") {
      setImage(null);
      setShowImage(false);
    } else {
      setShowImage(true);
    }
  }

  function handleGridModeChange(
    mode
  ) {
    finishStroke();

    if (mode === gridMode) return;

    let nextRows = manualRows;
    let nextCols = manualCols;

    // В ручном режиме начинаем с компактной, почти квадратной сетки.
    // Цвета изображения сразу пересчитываются по этим же размерам.
    if (mode === "manual") {
      const squareSide = Math.max(
        1,
        Math.round(Math.sqrt(requestedTotal))
      );

      nextRows = String(squareSide);
      nextCols = String(
        Math.max(1, Math.ceil(requestedTotal / squareSide))
      );
      setManualRows(nextRows);
      setManualCols(nextCols);
    }

    const d =
      getGridDimensions(
        requestedTotal,
        imageRatio,
        mode,
        nextRows,
        nextCols
      );

    setGridMode(mode);

    setCompletedDirectly(
      completedRef.current.size
        ? [
            ...completedRef.current,
          ].filter(
            (i) =>
              i < d.actualTotal
          )
        : []
    );

    if (image) {
      processImage(
        image,
        imageRatio,
        d.cols,
        d.rows
      );
    }
  }

  function handleManualRowsChange(
    e
  ) {
    const v =
      e.target.value;

    const nextTotal =
      Math.max(1, Number(v) || 1) *
      Math.max(1, Number(manualCols) || 1);

    setManualRows(v);
    setTotalCells(String(nextTotal));

    const d =
      getGridDimensions(
        nextTotal,
        imageRatio,
        "manual",
        v,
        manualCols
      );

    setCompletedDirectly(
      [
        ...completedRef.current,
      ].filter(
        (i) =>
          i < d.actualTotal
      )
    );

    if (image) {
      processImage(
        image,
        imageRatio,
        d.cols,
        d.rows
      );
    }
  }

  function handleManualColsChange(
    e
  ) {
    const v =
      e.target.value;

    const nextTotal =
      Math.max(1, Number(manualRows) || 1) *
      Math.max(1, Number(v) || 1);

    setManualCols(v);
    setTotalCells(String(nextTotal));

    const d =
      getGridDimensions(
        nextTotal,
        imageRatio,
        "manual",
        manualRows,
        v
      );

    setCompletedDirectly(
      [
        ...completedRef.current,
      ].filter(
        (i) =>
          i < d.actualTotal
      )
    );

    if (image) {
      processImage(
        image,
        imageRatio,
        d.cols,
        d.rows
      );
    }
  }

  function handleTotalCellsChange(
    e
  ) {
    const v =
      e.target.value;

    setTotalCells(v);

    if (gridMode === "auto") {
      const d =
        getGridDimensions(
          Math.max(
            1,
            Number(v) || 1
          ),
          imageRatio,
          "auto",
          manualRows,
          manualCols
        );

      setCompletedDirectly(
        [
          ...completedRef.current,
        ].filter(
          (i) =>
            i < d.actualTotal
        )
      );

      if (image) {
        processImage(
          image,
          imageRatio,
          d.cols,
          d.rows
        );
      }
    }

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
    const next = new Set(progressCompletedRef.current);
    const added = cells.slice(0, Math.min(count, available.length));
    added.forEach((index) => next.add(index));
    animateCells(added);
    progressCompletedRef.current = next;
    setProgressCompleted([...next]);
    recordPaintedCells(added.length);
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
    const safeTotal = Math.max(1, Number(next) || 1);
    const nextRows = Math.max(
      1,
      Math.round(Math.sqrt(safeTotal))
    );
    const nextCols = Math.max(1, Math.ceil(safeTotal / nextRows));

    setManualRows(
      String(nextRows)
    );
    setManualCols(
      String(nextCols)
    );
    setTotalCells(
      String(
        safeTotal
      )
    );

    setCompletedDirectly(
      [
        ...completedRef.current,
      ].filter(
        (i) =>
          i <
          safeTotal
      )
    );

    if (image) {
      processImage(
        image,
        imageRatio,
        nextCols,
        nextRows
      );
    }
  }

  function handleManualTotalCellsChange(e) {
    const value = e.target.value;
    setTotalCells(value);

    const next = Number(value);
    if (!Number.isFinite(next) || next < 1) return;

    updateManualTotalCells(next);
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

    const map =
      buildCurrentMap();

    if (!map) return;

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

  function openCreateModal() {
    setNewMapName("");
    setNewMapDescription("");
    setNewMapCategory("Личное");
    setNewMapDeadline("");
    setNewCategoryDraft("");
    setNewMapType("free");
    setNewMapGridMode("auto");
    setNewMapCells("500");
    setNewMapRows("20");
    setNewMapCols("25");
    setIsCreateOpen(true);
  }

  function addCustomCategory(target) {
    const category = newCategoryDraft.trim().slice(0, 36);
    if (!category) return;
    setCustomCategories((previous) => previous.includes(category) || MAP_CATEGORIES.includes(category) ? previous : [...previous, category]);
    if (target === "rename") setRenameCategory(category);
    else setNewMapCategory(category);
    setNewCategoryDraft("");
  }

  async function createMap() {
    const map = normalizeMap({
      id: createMapId(),
      name:
        newMapName.trim() ||
        "Новая карта",
      description: newMapDescription.trim(),
      category: newMapCategory === "__custom__" ? "Личное" : newMapCategory,
      deadline: newMapDeadline,
      mapType: newMapType,
      gridMode:
        newMapGridMode,
      totalCells: String(
        Math.max(
          1,
          Number(newMapCells) ||
            500
        )
      ),
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

    setActiveMapId(use.id);

    openMap(use);

    setIsCreateOpen(false);
    setScreen("editor");

    localStorage.setItem(
      ACTIVE_MAP_KEY,
      use.id
    );
  }

  function openMap(map) {
    finishStroke();

    const m =
      normalizeMap(map);

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

    setImage(m.image);

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
    setRenameValue(
      map.name || ""
    );
    setRenameDescription(map.description || "");
    setRenameCategory(map.category || "Личное");
    setRenameDeadline(map.deadline || "");
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
    setRenameMapId(null);
  }

  function openDeleteModal(
    map
  ) {
    setMapToDelete(map);
    setIsDeleteOpen(true);
  }

  async function confirmDeleteMap() {
    if (!mapToDelete)
      return;

    const deletingMap = mapToDelete;
    const id = deletingMap.id;
    const previousMaps = maps;

    const rest =
      maps.filter(
        (m) => m.id !== id
      );

    // Сначала меняем интерфейс: пользователь видит результат сразу,
    // не ожидая сетевой ответ базы данных.
    setMaps(rest);
    setIsDeleteOpen(false);
    setMapToDelete(null);

    if (id === activeMapId) {
      setActiveMapId(null);
      localStorage.removeItem(ACTIVE_MAP_KEY);
      setScreen("maps");
    }

    if (!user) return;

    const removeRemotely = async () => {
      const { error } = await supabase
        .from("maps")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) {
        console.error("Не удалось удалить карту:", error);
        // Возвращаем карту только если синхронизация действительно не удалась.
        setMaps((current) =>
          current.some((map) => map.id === id)
            ? current
            : previousMaps
        );
      }
    };

    const request = remoteSaveQueueRef.current.then(
      removeRemotely,
      removeRemotely
    );
    remoteSaveQueueRef.current = request.catch(() => null);
  }

  function downloadMap() {
    const c =
      canvasRef.current;

    if (!c) return;

    const a =
      document.createElement("a");

    const filename =
      (activeMap?.name ||
        "MM-map")
        .replace(
          /[\\/:*?"<>|]/g,
          ""
        )
        .trim() ||
      "MM-map";

    a.download =
      `${filename}.png`;

    a.href =
      c.toDataURL(
        "image/png"
      );

    a.click();
  }

  function downloadStoredMap(map) {
    const dimensions = getGridDimensions(
      Math.max(1, Number(map.totalCells) || 1),
      map.imageRatio || 1,
      map.gridMode,
      map.manualRows,
      map.manualCols
    );
    const cellSize = 18;
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.cols * cellSize;
    canvas.height = dimensions.rows * cellSize;
    const ctx = canvas.getContext("2d");
    const progressCells = new Set(map.progressCompleted || []);

    for (let i = 0; i < dimensions.actualTotal; i++) {
      const x = (i % dimensions.cols) * cellSize;
      const y = Math.floor(i / dimensions.cols) * cellSize;
      ctx.fillStyle = progressCells.has(i)
        ? map.colors?.[i] || "#32624f"
        : "#eeeeea";
      ctx.fillRect(x, y, cellSize, cellSize);
      ctx.strokeStyle = "#d8d4cc";
      ctx.strokeRect(x + 0.5, y + 0.5, cellSize, cellSize);
    }

    const link = document.createElement("a");
    const filename = (map.name || "MM-map").replace(/[\\/:*?\"<>|]/g, "").trim() || "MM-map";
    link.download = `${filename}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  return (
    <div className="app">
      {showVictory && (
        <div className="victory-overlay" role="status">
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
          <strong>Карта завершена!</strong>
          <span>Отличная работа — рисунок собран.</span>
        </div>
      )}
      <header className="header">
        <button
          className="back-link"
          onClick={() =>
            setScreen("maps")
          }
        >
          ← {t("myMaps")}
        </button>

        <button
          className="editor-brand"
          onClick={() =>
            setScreen("home")
          }
        >
          <span className="brand-mark">
            MM
          </span>

          <span>
            {screen === "home"
              ? `MM / ${t("home")}`
              : screen === "maps"
              ? `MM / ${t(
                  "myMaps"
                )}`
              : screen ===
                "account"
              ? `MM / ${t(
                  "account"
                )}`
              : t("editor")}
          </span>
        </button>

        <div className="header-actions">
          {screen === "home" && (
            <button
              className="home-how-btn"
              onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
            >
              Как это работает
            </button>
          )}
          <div className="language-menu">
            <button type="button" className="language-select" onClick={() => setIsLanguageOpen((open) => !open)}>
              {LANGUAGE_OPTIONS.find(([code]) => code === language)?.[1] || "Русский"} <span>{isLanguageOpen ? "▲" : "▼"}</span>
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
              <button className="download-map-btn" onClick={downloadMap} disabled={!activeMap}>
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
              className="account-menu"
              style={{
                position:
                  "relative",
                marginLeft:
                  "8px",
              }}
            >
              <button
                type="button"
                onClick={() =>
                  setIsAccountOpen(
                    (v) => !v
                  )
                }
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
                }}
              >
                <span
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
                  {accountName}
                </span>

                <span
                  style={{
                    fontSize:
                      "10px",
                    opacity:
                      0.55,
                  }}
                >
                  {isAccountOpen
                    ? "▲"
                    : "▼"}
                </span>
              </button>

              {isAccountOpen && (
                <div
                  className="account-popover"
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
                    onClick={() => {
                      setIsAccountOpen(
                        false
                      );
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
                      setIsAccountOpen(
                        false
                      );
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
            <div className="pyramid-heading">
              <div>
                <span className="landing-label">Интерактивная карта</span>
                <h2>Карта прогресса</h2>
                <p>Кликай по клеткам — рисунок растёт вместе с твоими шагами.</p>
              </div>
              <div className="hero-demo-progress">
                <strong>{Math.round((heroDemoCells.size / DEMO_PYRAMID_TOTAL) * 100)}%</strong>
                <span>{heroDemoCells.size} / {DEMO_PYRAMID_TOTAL} клеток</span>
              </div>
            </div>

            <div className="pyramid-card">
              <div className="pyramid-card-meta">
                <span>Каждая клетка — маленькое действие</span>
              </div>
              {showDemoVictory && (
                <div className="demo-victory" role="status">
                  <div aria-hidden="true">✦ ✺ ✧ ✦ ✺ ✧</div>
                  <strong>Пирамида собрана!</strong>
                  <span>Вот это упорство.</span>
                </div>
              )}
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
              <div className="pyramid-card-footer">Меняй карту — она отвечает на каждое нажатие.</div>
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
              <span className="workspace-type">
                MM
              </span>

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
              <div className="account-avatar">{accountInitial}</div>
              <div>
                <span className="account-eyebrow">ТВОЙ ПРОФИЛЬ</span>
                <h2>{accountName}</h2>
                <p>{accountEmail}</p>
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

            <section className="account-history-card">
              <div>
                <span className="account-eyebrow">ИСТОРИЯ ДВИЖЕНИЯ</span>
                <h2>Твоя неделя на карте</h2>
                <p>Каждая колонка — клетки, которые ты отметил в этот день.</p>
              </div>
              <div className="history-chart">
                {accountHistory.map((item) => (
                  <div className="history-day" key={item.key} title={`${item.label}: ${item.cells} клеток`}>
                    <i style={{ height: `${Math.max(item.cells ? 12 : 3, (item.cells / accountHistoryMax) * 100)}%` }} />
                    <strong>{item.cells || "—"}</strong>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="account-plan-card">
              <div>
                <span className="account-eyebrow">ПЛАН НА СЕГОДНЯ</span>
                <h2>{accountDailyGoal ? "Двигайся в своём ритме" : "Начни с первой карты"}</h2>
                <p>
                  {accountDailyGoal
                    ? `Чтобы завершить текущие карты примерно за 30 дней, достаточно закрашивать ${accountDailyGoal} клеток в день.`
                    : "Создай карту, выбери рисунок — и здесь появится твой личный темп."}
                </p>
              </div>
              <div className="account-goal-ring" style={{ "--progress": `${Math.min(100, accountProgressPercent)}%` }}>
                <strong>{accountProgressPercent}%</strong>
                <span>всего</span>
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

      {screen === "maps" && (
        <section className="maps-page">
          <div className="maps-page-header">
            <div>
              <h1>
                {t("myMaps")}
              </h1>
            </div>

            <button
              className="save-map-btn"
              onClick={
                openCreateModal
              }
            >
              + {t("newMap")}
            </button>
          </div>

          {!maps.length ? (
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
                  <button key={category} className={mapCategoryFilter === category ? "active" : ""} onClick={() => setMapCategoryFilter(category)}>{category}</button>
                ))}
              </div>
            <div className="maps-list">
              {maps.filter((map) => mapCategoryFilter === "Все" || map.category === mapCategoryFilter).map(
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

                  const done = Math.min(d.actualTotal, map.progressCompleted?.length || 0);

                  const completedCells = new Set(
                    map.progressCompleted || []
                  );
                  const drawingCells = new Set(map.completed || []);

                  const p = d.actualTotal
                    ? Math.round((done / d.actualTotal) * 1000) / 10
                    : 0;

                  return (
                    <article
                      className="map-card"
                      key={
                        map.id
                      }
                      onClick={() => {
                        openMap(
                          map
                        );
                        setScreen(
                          "editor"
                        );
                      }}
                      >
                      <div className="map-card-preview">
                        <div
                            className="map-card-grid"
                            style={{
                              gridTemplateColumns: `repeat(${d.cols},minmax(0,1fr))`,
                              aspectRatio: `${d.cols}/${d.rows}`,
                            }}
                          >
                            {Array.from(
                              {
                                length:
                                  d.actualTotal,
                              },
                              (
                                _,
                                i
                              ) => (
                                <span
                                  key={
                                    i
                                  }
                                  className={`map-card-cell ${
                                    completedCells.has(i)
                                      ? "filled"
                                      : ""
                                  }`}
                                  style={{
                                    backgroundColor: completedCells.has(i)
                                      ? map.colors?.[i] || "#32624f"
                                      : map.mapType === "image" || drawingCells.has(i)
                                        ? map.colors?.[i] || "#dcdcdc"
                                        : "#deded8",
                                    // В карточке всегда оставляем полупрозрачный
                                    // ориентир полного изображения, чтобы было понятно,
                                    // какую часть пользователь заполняет в игре.
                                    opacity: !completedCells.has(i) && (map.mapType === "image" || drawingCells.has(i)) ? 0.3 : 1,
                                  }}
                                />
                              )
                            )}
                          </div>
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
                            <span className="map-card-meta">{map.category || "Личное"}{map.deadline ? ` · до ${map.deadline.split("-").reverse().join(".")}` : ""}</span>
                          </div>

                          <strong className="map-card-percent">
                            {p}%
                          </strong>
                        </div>

                        <div className="map-card-progress">
                          <i
                            style={{
                              width: `${p}%`,
                            }}
                          />
                        </div>

                        <div className="map-card-footer">
                          <span>
                            {done} /{" "}
                            {
                              d.actualTotal
                            }{" "}
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

                                openMap(
                                  map
                                );

                                setScreen(
                                  "editor"
                                );
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
                                downloadStoredMap(map);
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

              <select
                className="map-select"
                value={
                  activeMapId ||
                  ""
                }
                onChange={(e) => {
                  const m =
                    maps.find(
                      (x) =>
                        x.id ===
                        e.target
                          .value
                    );

                  if (m) {
                    openMap(
                      m
                    );
                  }
                }}
              >
                {maps.map((m) => (
                  <option
                    key={m.id}
                    value={m.id}
                  >
                    {m.name}
                  </option>
                ))}
              </select>

              <div className="map-actions">
                <button
                  className="text-action"
                  onClick={
                    openCreateModal
                  }
                >
                  + {t("new")}
                </button>

                {activeMap && (
                  <>
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

                  <input
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

                    <input
                      type="number"
                      min="1"
                      value={
                        manualRows
                      }
                      onChange={
                        handleManualRowsChange
                      }
                    />
                  </div>

                  <div className="compact-field">
                    <label>
                      {t(
                        "columns"
                      )}
                    </label>

                    <input
                      type="number"
                      min="1"
                      value={
                        manualCols
                      }
                      onChange={
                        handleManualColsChange
                      }
                    />
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

                      <input
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

              <div className="grid-info">
                {t("grid")}{" "}
                {rows} ×{" "}
                {cols} ·{" "}
                {actualTotal}{" "}
                {language === "ru" ? "Клеток" : t("cells")}
              </div>
            </section>

            <section className="sidebar-section">
              <div className="section-heading">
                {t("tools")}
              </div>

              <div className="tool-stack">
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
                    ↶{" "}
                    {t(
                      "undo"
                    )}
                  </button>

                  <button
                    className="tool-btn"
                    onClick={
                      redo
                    }
                  >
                    ↷{" "}
                    {t(
                      "redo"
                    )}
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
                    {BASIC_COLORS.map(
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

                  <div className="custom-color-create">
                    <label className="color-picker-wrap" htmlFor="new-color-picker">
                      <input
                        id="new-color-picker"
                        type="color"
                        value={
                          newColor
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
              >
                <div
                  className="grid-zoom-stage"
                  style={{
                    width: `${
                      mapZoom *
                      100
                    }%`,
                    height: `${
                      mapZoom *
                      100
                    }%`,
                    minWidth: `${
                      mapZoom *
                      100
                    }%`,
                    minHeight: `${
                      mapZoom *
                      100
                    }%`,
                  }}
                >
                  <div
                    className="grid-container"
                    style={{
                      aspectRatio: `${cols}/${rows}`,
                    }}
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
                      onPointerCancel={
                        handlePointerCancel
                      }
                      onContextMenu={(
                        e
                      ) =>
                        e.preventDefault()
                      }
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="drawing-hint">
              {t(
                "drawHint"
              )} · Ctrl+Z / Ctrl+Y
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
                    // Превью всегда показывает реальный прогресс режима игры,
                    // а не рабочий эскиз из режима рисования.
                    const active = progressCompleted.includes(i);

                    const color =
                      colors[i] ||
                      "#e5e5e5";

                    return (
                      <span
                        key={i}
                        className={cellAnimationsRef.current.has(i) ? "cell-pop" : ""}
                        style={{
                          backgroundColor: active
                            ? color
                            : mapType === "image" && showImage && image
                              ? color
                              : "#eeeeea",
                          opacity: !active && mapType === "image" && showImage && image ? 0.35 : 1,
                        }}
                      />
                    );
                  }
                )}
              </div>

              <div className="preview-progress">
                <strong>
                  {displayedProgress}%
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

      {isCreateOpen && (
        <div
          className="modal-overlay"
          onMouseDown={() =>
            setIsCreateOpen(
              false
            )
          }
        >
          <div
            className="create-modal"
            onMouseDown={(e) =>
              e.stopPropagation()
            }
          >
            <div className="modal-header">
              <h2>
                {t("newMap")}
              </h2>

              <button
                className="modal-close"
                onClick={() =>
                  setIsCreateOpen(
                    false
                  )
                }
              >
                ×
              </button>
            </div>

            <div className="modal-field">
              <label>
                {t("name")}
              </label>

              <input
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
                <input autoFocus value={newCategoryDraft} placeholder="Например, Финансы" onChange={(event) => setNewCategoryDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addCustomCategory("create")} />
                <button type="button" onClick={() => addCustomCategory("create")}>Добавить</button>
              </div>
            )}

            <div className="modal-field">
              <label>
                {t("mapType")}
              </label>

              <div className="modal-map-types">
                <button
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

                <input
                  className="map-cells-input"
                  type="number"
                  min="1"
                  value={
                    newMapCells
                  }
                  onChange={(e) =>
                    setNewMapCells(
                      e.target
                        .value
                    )
                  }
                />
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

            <button
              className="modal-create-btn"
              onClick={
                createMap
              }
            >
              {t(
                "createMap"
              )}
            </button>
          </div>
        </div>
      )}

      {isRenameOpen && (
        <div
          className="modal-overlay"
          onMouseDown={() =>
            setIsRenameOpen(
              false
            )
          }
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
                onClick={() =>
                  setIsRenameOpen(
                    false
                  )
                }
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

      {isDeleteOpen &&
        mapToDelete && (
          <div
            className="modal-overlay"
            onMouseDown={() =>
              setIsDeleteOpen(
                false
              )
            }
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
                  onClick={() =>
                    setIsDeleteOpen(
                      false
                    )
                  }
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
                  onClick={() =>
                    setIsDeleteOpen(
                      false
                    )
                  }
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
