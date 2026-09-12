import { useEffect, useRef, useState } from "react";

import "./App.css";

import Auth from "./Auth";

import { supabase } from "./lib/supabase";

const STORAGE_KEY = "mm-maps";
const ACTIVE_MAP_KEY = "mm-active-map";
const LANGUAGE_KEY = "mm-language";
const CURRENT_SCREEN_KEY = "mm-current-screen";

const translations = {
  ru: {
    myMaps: "Мои карты",
    editor: "MM / редактор",
    save: "Сохранить карту",
    mapData: "ДАННЫЕ КАРТЫ",
    name: "Название",
    description: "Описание",
    mapDescription: "Карта прогресса в клетках",
    new: "Новая",
    edit: "Изменить",
    delete: "Удалить",
    canvasSize: "РАЗМЕР ХОЛСТА",
    auto: "Авто",
    manual: "Вручную",
    cells: "клеток",
    rows: "Строки",
    columns: "Столбцы",
    grid: "Сетка",
    tools: "ИНСТРУМЕНТЫ",
    brush: "Кисть",
    image: "Изображение",
    undo: "Отменить",
    redo: "Повторить",
    uploadImage: "Загрузить изображение",
    replaceImage: "Заменить изображение",
    clearImage: "Очистить изображение",
    showImage: "Показывать изображение",
    palette: "ПАЛИТРА",
    brushColor: "Цвет кисти",
    newCells: "Для новых клеток",
    myColors: "Мои цвета",
    addColor: "Добавить",
    imageMap: "КАРТА ПО ИЗОБРАЖЕНИЮ",
    freeDrawing: "СВОБОДНОЕ РИСОВАНИЕ",
    newMap: "Новая карта",
    preview: "ПРЕДПРОСМОТР",
    filled: "заполнено",
    painted: "Закрашено",
    total: "Всего",
    clearProgress: "Очистить прогресс",
    drawHint: "ЛКМ — рисовать · ПКМ — стирать",
    mapsEmpty: "Пока нет созданных карт",
    open: "Открыть",
    createMap: "Создать карту",
    renameMap: "Переименовать карту",
    newName: "Новое название",
    mapType: "Тип карты",
    cancel: "Отмена",
    deleteMap: "Удалить карту?",
  },

  en: {
    myMaps: "My Maps",
    editor: "MM / Editor",
    save: "Save map",
    mapData: "MAP DATA",
    name: "Name",
    description: "Description",
    mapDescription: "Progress map in cells",
    new: "New",
    edit: "Edit",
    delete: "Delete",
    canvasSize: "CANVAS SIZE",
    auto: "Auto",
    manual: "Manual",
    cells: "cells",
    rows: "Rows",
    columns: "Columns",
    grid: "Grid",
    tools: "TOOLS",
    brush: "Brush",
    image: "Image",
    undo: "Undo",
    redo: "Redo",
    uploadImage: "Upload image",
    replaceImage: "Replace image",
    clearImage: "Clear image",
    showImage: "Show image",
    palette: "PALETTE",
    brushColor: "Brush color",
    newCells: "For new cells",
    myColors: "My colors",
    addColor: "Add",
    imageMap: "IMAGE MAP",
    freeDrawing: "FREE DRAWING",
    newMap: "New map",
    preview: "PREVIEW",
    filled: "filled",
    painted: "Painted",
    total: "Total",
    clearProgress: "Clear progress",
    drawHint: "Left click — draw · Right click — erase",
    mapsEmpty: "No maps yet",
    open: "Open",
    createMap: "Create map",
    renameMap: "Rename map",
    newName: "New name",
    mapType: "Map type",
    cancel: "Cancel",
    deleteMap: "Delete map?",
  },

  es: {
    myMaps: "Mis mapas",
    editor: "MM / editor",
    save: "Guardar mapa",
    mapData: "DATOS DEL MAPA",
    name: "Nombre",
    description: "Descripción",
    mapDescription: "Mapa de progreso por celdas",
    new: "Nuevo",
    edit: "Editar",
    delete: "Eliminar",
    canvasSize: "TAMAÑO DEL LIENZO",
    auto: "Auto",
    manual: "Manual",
    cells: "celdas",
    rows: "Filas",
    columns: "Columnas",
    grid: "Cuadrícula",
    tools: "HERRAMIENTAS",
    brush: "Pincel",
    image: "Imagen",
    undo: "Deshacer",
    redo: "Rehacer",
    uploadImage: "Subir imagen",
    replaceImage: "Cambiar imagen",
    clearImage: "Borrar imagen",
    showImage: "Mostrar imagen",
    palette: "PALETA",
    brushColor: "Color del pincel",
    newCells: "Para celdas nuevas",
    myColors: "Mis colores",
    addColor: "Añadir",
    imageMap: "MAPA DE IMAGEN",
    freeDrawing: "DIBUJO LIBRE",
    newMap: "Nuevo mapa",
    preview: "VISTA PREVIA",
    filled: "completado",
    painted: "Pintadas",
    total: "Total",
    clearProgress: "Borrar progreso",
    drawHint: "Clic izq. — dibujar · Clic der. — borrar",
    mapsEmpty: "Aún no hay mapas",
    open: "Abrir",
    createMap: "Crear mapa",
    renameMap: "Renombrar mapa",
    newName: "Nuevo nombre",
    mapType: "Tipo de mapa",
    cancel: "Cancelar",
    deleteMap: "¿Eliminar mapa?",
  },

  ja: {
    myMaps: "マイマップ",
    editor: "MM / エディター",
    save: "マップを保存",
    mapData: "マップ情報",
    name: "名前",
    description: "説明",
    mapDescription: "セルで進捗を管理するマップ",
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
    clearImage: "画像を消去",
    showImage: "画像を表示",
    palette: "パレット",
    brushColor: "ブラシの色",
    newCells: "新しいセル用",
    myColors: "マイカラー",
    addColor: "追加",
    imageMap: "画像マップ",
    freeDrawing: "フリードローイング",
    newMap: "新しいマップ",
    preview: "プレビュー",
    filled: "完了",
    painted: "塗りつぶし",
    total: "合計",
    clearProgress: "進捗を消去",
    drawHint: "左クリック：描画 ・ 右クリック：消去",
    mapsEmpty: "マップはまだありません",
    open: "開く",
    createMap: "マップを作成",
    renameMap: "マップ名を変更",
    newName: "新しい名前",
    mapType: "マップの種類",
    cancel: "キャンセル",
    deleteMap: "マップを削除しますか？",
  },

  de: {
    myMaps: "Meine Karten",
    editor: "MM / Editor",
    save: "Karte speichern",
    mapData: "KARTENDATEN",
    name: "Name",
    description: "Beschreibung",
    mapDescription: "Fortschrittskarte in Zellen",
    new: "Neu",
    edit: "Bearbeiten",
    delete: "Löschen",
    canvasSize: "LEINWANDGRÖSSE",
    auto: "Auto",
    manual: "Manuell",
    cells: "Zellen",
    rows: "Zeilen",
    columns: "Spalten",
    grid: "Raster",
    tools: "WERKZEUGE",
    brush: "Pinsel",
    image: "Bild",
    undo: "Rückgängig",
    redo: "Wiederholen",
    uploadImage: "Bild hochladen",
    replaceImage: "Bild ersetzen",
    clearImage: "Bild löschen",
    showImage: "Bild zeigen",
    palette: "PALETTE",
    brushColor: "Pinselfarbe",
    newCells: "Für neue Zellen",
    myColors: "Meine Farben",
    addColor: "Hinzufügen",
    imageMap: "BILDKARTE",
    freeDrawing: "FREIES ZEICHNEN",
    newMap: "Neue Karte",
    preview: "VORSCHAU",
    filled: "ausgefüllt",
    painted: "Ausgemalt",
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
    deleteMap: "Karte löschen?",
  },

  fr: {
    myMaps: "Mes cartes",
    editor: "MM / éditeur",
    save: "Enregistrer",
    mapData: "DONNÉES DE LA CARTE",
    name: "Nom",
    description: "Description",
    mapDescription: "Carte de progression en cellules",
    new: "Nouveau",
    edit: "Modifier",
    delete: "Supprimer",
    canvasSize: "TAILLE DU CANEVAS",
    auto: "Auto",
    manual: "Manuel",
    cells: "cellules",
    rows: "Lignes",
    columns: "Colonnes",
    grid: "Grille",
    tools: "OUTILS",
    brush: "Pinceau",
    image: "Image",
    undo: "Annuler",
    redo: "Rétablir",
    uploadImage: "Téléverser une image",
    replaceImage: "Remplacer l’image",
    clearImage: "Effacer l’image",
    showImage: "Afficher l’image",
    palette: "PALETTE",
    brushColor: "Couleur du pinceau",
    newCells: "Pour les nouvelles cellules",
    myColors: "Mes couleurs",
    addColor: "Ajouter",
    imageMap: "CARTE D’IMAGE",
    freeDrawing: "DESSIN LIBRE",
    newMap: "Nouvelle carte",
    preview: "APERÇU",
    filled: "rempli",
    painted: "Colorées",
    total: "Total",
    clearProgress: "Effacer la progression",
    drawHint: "Clic gauche — dessiner · clic droit — effacer",
    mapsEmpty: "Aucune carte",
    open: "Ouvrir",
    createMap: "Créer la carte",
    renameMap: "Renommer la carte",
    newName: "Nouveau nom",
    mapType: "Type de carte",
    cancel: "Annuler",
    deleteMap: "Supprimer la carte ?",
  },

  it: {
    myMaps: "Le mie mappe",
    editor: "MM / editor",
    save: "Salva mappa",
    mapData: "DATI DELLA MAPPA",
    name: "Nome",
    description: "Descrizione",
    mapDescription: "Mappa dei progressi a celle",
    new: "Nuova",
    edit: "Modifica",
    delete: "Elimina",
    canvasSize: "DIMENSIONE TELA",
    auto: "Auto",
    manual: "Manuale",
    cells: "celle",
    rows: "Righe",
    columns: "Colonne",
    grid: "Griglia",
    tools: "STRUMENTI",
    brush: "Pennello",
    image: "Immagine",
    undo: "Annulla",
    redo: "Ripeti",
    uploadImage: "Carica immagine",
    replaceImage: "Sostituisci immagine",
    clearImage: "Cancella immagine",
    showImage: "Mostra immagine",
    palette: "TAVOLOZZA",
    brushColor: "Colore pennello",
    newCells: "Per nuove celle",
    myColors: "I miei colori",
    addColor: "Aggiungi",
    imageMap: "MAPPA IMMAGINE",
    freeDrawing: "DISEGNO LIBERO",
    newMap: "Nuova mappa",
    preview: "ANTEPRIMA",
    filled: "completato",
    painted: "Colorate",
    total: "Totale",
    clearProgress: "Cancella progresso",
    drawHint: "Clic sinistro — disegna · destro — cancella",
    mapsEmpty: "Nessuna mappa",
    open: "Apri",
    createMap: "Crea mappa",
    renameMap: "Rinomina mappa",
    newName: "Nuovo nome",
    mapType: "Tipo di mappa",
    cancel: "Annulla",
    deleteMap: "Eliminare la mappa?",
  },

  pt: {
    myMaps: "Meus mapas",
    editor: "MM / editor",
    save: "Salvar mapa",
    mapData: "DADOS DO MAPA",
    name: "Nome",
    description: "Descrição",
    mapDescription: "Mapa de progresso em células",
    new: "Novo",
    edit: "Editar",
    delete: "Excluir",
    canvasSize: "TAMANHO DA TELA",
    auto: "Auto",
    manual: "Manual",
    cells: "células",
    rows: "Linhas",
    columns: "Colunas",
    grid: "Grade",
    tools: "FERRAMENTAS",
    brush: "Pincel",
    image: "Imagem",
    undo: "Desfazer",
    redo: "Refazer",
    uploadImage: "Enviar imagem",
    replaceImage: "Substituir imagem",
    clearImage: "Limpar imagem",
    showImage: "Mostrar imagem",
    palette: "PALETA",
    brushColor: "Cor do pincel",
    newCells: "Para novas células",
    myColors: "Minhas cores",
    addColor: "Adicionar",
    imageMap: "MAPA DE IMAGEM",
    freeDrawing: "DESENHO LIVRE",
    newMap: "Novo mapa",
    preview: "PRÉVIA",
    filled: "preenchido",
    painted: "Pintadas",
    total: "Total",
    clearProgress: "Limpar progresso",
    drawHint: "Clique esquerdo — desenhar · direito — apagar",
    mapsEmpty: "Ainda não há mapas",
    open: "Abrir",
    createMap: "Criar mapa",
    renameMap: "Renomear mapa",
    newName: "Novo nome",
    mapType: "Tipo de mapa",
    cancel: "Cancelar",
    deleteMap: "Excluir mapa?",
  },

  zh: {
    myMaps: "我的地图",
    editor: "MM / 编辑器",
    save: "保存地图",
    mapData: "地图信息",
    name: "名称",
    description: "描述",
    mapDescription: "单元格进度地图",
    new: "新建",
    edit: "编辑",
    delete: "删除",
    canvasSize: "画布尺寸",
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
    clearImage: "清除图片",
    showImage: "显示图片",
    palette: "调色板",
    brushColor: "画笔颜色",
    newCells: "用于新单元格",
    myColors: "我的颜色",
    addColor: "添加",
    imageMap: "图片地图",
    freeDrawing: "自由绘制",
    newMap: "新地图",
    preview: "预览",
    filled: "已填充",
    painted: "已涂色",
    total: "总数",
    clearProgress: "清除进度",
    drawHint: "左键绘制 · 右键擦除",
    mapsEmpty: "尚无地图",
    open: "打开",
    createMap: "创建地图",
    renameMap: "重命名地图",
    newName: "新名称",
    mapType: "地图类型",
    cancel: "取消",
    deleteMap: "删除地图？",
  },

  ko: {
    myMaps: "내 지도",
    editor: "MM / 편집기",
    save: "지도 저장",
    mapData: "지도 정보",
    name: "이름",
    description: "설명",
    mapDescription: "셀 기반 진행 지도",
    new: "새로 만들기",
    edit: "편집",
    delete: "삭제",
    canvasSize: "캔버스 크기",
    auto: "자동",
    manual: "수동",
    cells: "셀",
    rows: "행",
    columns: "열",
    grid: "격자",
    tools: "도구",
    brush: "브러시",
    image: "이미지",
    undo: "실행 취소",
    redo: "다시 실행",
    uploadImage: "이미지 업로드",
    replaceImage: "이미지 교체",
    clearImage: "이미지 지우기",
    showImage: "이미지 표시",
    palette: "팔레트",
    brushColor: "브러시 색상",
    newCells: "새 셀용",
    myColors: "내 색상",
    addColor: "추가",
    imageMap: "이미지 지도",
    freeDrawing: "자유 그리기",
    newMap: "새 지도",
    preview: "미리보기",
    filled: "채움",
    painted: "칠한 셀",
    total: "전체",
    clearProgress: "진행 상황 지우기",
    drawHint: "왼쪽 클릭 — 그리기 · 오른쪽 클릭 — 지우기",
    mapsEmpty: "아직 지도가 없습니다",
    open: "열기",
    createMap: "지도 만들기",
    renameMap: "지도 이름 바꾸기",
    newName: "새 이름",
    mapType: "지도 유형",
    cancel: "취소",
    deleteMap: "지도를 삭제할까요?",
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
  "#ff2d55",
];

function createMapId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8)
  );
}

function normalizeHexColor(color) {
  if (typeof color !== "string") {
    return null;
  }

  const value = color.trim().toLowerCase();

  if (/^#[0-9a-f]{6}$/i.test(value)) {
    return value;
  }

  return null;
}

function normalizeMap(map) {
  return {
    ...map,

    customColors: Array.isArray(map.customColors)
      ? map.customColors
          .map(normalizeHexColor)
          .filter(Boolean)
          .filter(
            (color, index, array) =>
              array.indexOf(color) === index
          )
          .filter(
            (color) => !BASIC_COLORS.includes(color)
          )
      : [],

    drawColor:
      normalizeHexColor(map.drawColor) ||
      BASIC_COLORS[0],

    completed: Array.isArray(map.completed)
      ? [...new Set(map.completed)]
      : [],

    colors: Array.isArray(map.colors)
      ? map.colors
      : [],

    mapType:
      map.mapType === "image" ||
      map.mapType === "free"
        ? map.mapType
        : "free",

    gridMode:
      map.gridMode === "manual"
        ? "manual"
        : "auto",

    image:
      typeof map.image === "string"
        ? map.image
        : null,

    imageRatio:
      typeof map.imageRatio === "number"
        ? map.imageRatio
        : 1,

    totalCells:
      typeof map.totalCells === "string"
        ? map.totalCells
        : String(map.totalCells ?? 500),

    manualRows:
      typeof map.manualRows === "string"
        ? map.manualRows
        : String(map.manualRows ?? 20),

    manualCols:
      typeof map.manualCols === "string"
        ? map.manualCols
        : String(map.manualCols ?? 25),

    showImage:
      typeof map.showImage === "boolean"
        ? map.showImage
        : true,

    description:
      typeof map.description === "string"
        ? map.description
        : "",
  };
}

function getInitialData() {
  try {
    const savedMaps = localStorage.getItem(STORAGE_KEY);
    const activeMapId = localStorage.getItem(ACTIVE_MAP_KEY);

    if (savedMaps) {
      const maps = JSON.parse(savedMaps);

      if (Array.isArray(maps) && maps.length > 0) {
        const normalizedMaps = maps.map(normalizeMap);

        const activeMap =
          normalizedMaps.find(
            (map) => map.id === activeMapId
          ) || normalizedMaps[0];

        return {
          maps: normalizedMaps,
          activeMap,
        };
      }
    }

    const oldMap = localStorage.getItem("mm-current-map");

    if (oldMap) {
      const parsed = JSON.parse(oldMap);

      const migratedMap = normalizeMap({
        id: createMapId(),
        name: "Моя карта",
        mapType:
          parsed.mapType === "image" ||
          parsed.mapType === "free"
            ? parsed.mapType
            : parsed.image
              ? "image"
              : "free",
        gridMode: "auto",
        completed: Array.isArray(parsed.completed)
          ? parsed.completed
          : [],
        image:
          typeof parsed.image === "string"
            ? parsed.image
            : null,
        colors: Array.isArray(parsed.colors)
          ? parsed.colors
          : [],
        customColors: [],
        drawColor:
          normalizeHexColor(parsed.drawColor) ||
          BASIC_COLORS[0],
        imageRatio:
          typeof parsed.imageRatio === "number"
            ? parsed.imageRatio
            : 1,
        totalCells:
          typeof parsed.totalCells === "string"
            ? parsed.totalCells
            : "500",
        manualRows: "20",
        manualCols: "25",
        showImage:
          typeof parsed.showImage === "boolean"
            ? parsed.showImage
            : true,
        description: "",
      });

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([migratedMap])
      );

      localStorage.setItem(
        ACTIVE_MAP_KEY,
        migratedMap.id
      );

      return {
        maps: [migratedMap],
        activeMap: migratedMap,
      };
    }
  } catch (error) {
    console.error(
      "Не удалось загрузить локальные карты:",
      error
    );
  }

  return {
    maps: [],
    activeMap: null,
  };
}

const initialData = getInitialData();

function mapToSupabaseRow(map, userId) {
  const {
    id,
    name,
    ...data
  } = normalizeMap(map);

  return {
    id,
    user_id: userId,
    name,
    data,
  };
}

function mapFromSupabaseRow(row) {
  return normalizeMap({
    ...(row.data || {}),
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
    const rows = Math.max(
      1,
      Number(manualRows) || 1
    );

    const cols = Math.max(
      1,
      Number(manualCols) || 1
    );

    return {
      rows,
      cols,
      actualTotal: rows * cols,
    };
  }

  const cols = Math.max(
    1,
    Math.round(
      Math.sqrt(total * ratio)
    )
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

function getLineCells(
  startIndex,
  endIndex,
  cols,
  rows
) {
  const startRow =
    Math.floor(startIndex / cols);

  const startCol =
    startIndex % cols;

  const endRow =
    Math.floor(endIndex / cols);

  const endCol =
    endIndex % cols;

  const cells = new Set();

  const dx = endCol - startCol;
  const dy = endRow - startRow;

  const steps = Math.max(
    Math.abs(dx),
    Math.abs(dy)
  );

  if (steps === 0) {
    return [startIndex];
  }

  for (
    let step = 0;
    step <= steps;
    step++
  ) {
    const progress = step / steps;

    const col = Math.round(
      startCol + dx * progress
    );

    const row = Math.round(
      startRow + dy * progress
    );

    if (
      col >= 0 &&
      col < cols &&
      row >= 0 &&
      row < rows
    ) {
      cells.add(
        row * cols + col
      );
    }
  }

  return [...cells];
}

function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] =
    useState(true);
  const [mapsLoading, setMapsLoading] =
    useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (mounted) {
        setUser(session?.user ?? null);
        setAuthLoading(false);
      }
    }

    loadSession();

    const {
      data: { subscription },
    } =
      supabase.auth.onAuthStateChange(
        (_event, session) => {
          setUser(session?.user ?? null);
        }
      );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const canvasRef = useRef(null);

  const [language, setLanguage] =
    useState(() => {
      const savedLanguage =
        localStorage.getItem(
          LANGUAGE_KEY
        );

      return translations[savedLanguage]
        ? savedLanguage
        : "ru";
    });

  const [screen, setScreen] =
    useState(() => {
      const savedScreen =
        localStorage.getItem(
          CURRENT_SCREEN_KEY
        );

      return [
        "home",
        "maps",
        "editor",
      ].includes(savedScreen)
        ? savedScreen
        : "home";
    });

  const [saveStatus, setSaveStatus] =
    useState("");

  const [maps, setMaps] =
    useState(initialData.maps);

  const [activeMapId, setActiveMapId] =
    useState(
      initialData.activeMap?.id ||
        null
    );

  const activeMap =
    maps.find(
      (map) =>
        map.id === activeMapId
    ) || null;

  const t = (key) =>
    additionalTranslations[
      language
    ]?.[key] ||
    translations[language]?.[key] ||
    additionalTranslations.ru[key] ||
    translations.ru[key] ||
    key;

  const [mapType, setMapType] =
    useState(
      activeMap?.mapType || "free"
    );

  const [gridMode, setGridMode] =
    useState(
      activeMap?.gridMode === "manual"
        ? "manual"
        : "auto"
    );

  const [completed, setCompleted] =
    useState(
      Array.isArray(
        activeMap?.completed
      )
        ? activeMap.completed
        : []
    );

  const [image, setImage] =
    useState(
      typeof activeMap?.image ===
        "string"
        ? activeMap.image
        : null
    );

  const [colors, setColors] =
    useState(
      Array.isArray(
        activeMap?.colors
      )
        ? activeMap.colors
        : []
    );

  const [imageRatio, setImageRatio] =
    useState(
      typeof activeMap?.imageRatio ===
        "number"
        ? activeMap.imageRatio
        : 1
    );

  const [drawColor, setDrawColor] =
    useState(
      normalizeHexColor(
        activeMap?.drawColor
      ) || BASIC_COLORS[0]
    );

  const [customColors, setCustomColors] =
    useState(
      Array.isArray(
        activeMap?.customColors
      )
        ? activeMap.customColors
        : []
    );

  const [newColor, setNewColor] =
    useState(
      normalizeHexColor(
        activeMap?.drawColor
      ) || BASIC_COLORS[0]
    );

  const [isDrawing, setIsDrawing] =
    useState(false);

  const [drawMode, setDrawMode] =
    useState("draw");

  const [totalCells, setTotalCells] =
    useState(
      typeof activeMap?.totalCells ===
        "string"
        ? activeMap.totalCells
        : "500"
    );

  const [manualRows, setManualRows] =
    useState(
      typeof activeMap?.manualRows ===
        "string"
        ? activeMap.manualRows
        : "20"
    );

  const [manualCols, setManualCols] =
    useState(
      typeof activeMap?.manualCols ===
        "string"
        ? activeMap.manualCols
        : "25"
    );

  const [showImage, setShowImage] =
    useState(
      typeof activeMap?.showImage ===
        "boolean"
        ? activeMap.showImage
        : true
    );

  const [description, setDescription] =
    useState(
      typeof activeMap?.description ===
        "string"
        ? activeMap.description
        : ""
    );

  const [isCreateOpen, setIsCreateOpen] =
    useState(false);

  const [newMapName, setNewMapName] =
    useState("");

  const [newMapType, setNewMapType] =
    useState("free");

  const [
    newMapGridMode,
    setNewMapGridMode,
  ] = useState("auto");

  const [newMapCells, setNewMapCells] =
    useState("500");

  const [newMapRows, setNewMapRows] =
    useState("20");

  const [newMapCols, setNewMapCols] =
    useState("25");

  const [isRenameOpen, setIsRenameOpen] =
    useState(false);

  const [renameValue, setRenameValue] =
    useState("");

  const [renameMapId, setRenameMapId] =
    useState(null);

  const [isDeleteOpen, setIsDeleteOpen] =
    useState(false);

  const [mapToDelete, setMapToDelete] =
    useState(null);

  const isDrawingRef =
    useRef(false);

  const drawModeRef =
    useRef("draw");

  const previousCellRef =
    useRef(null);

  const activePointerIdRef =
    useRef(null);

  const completedRef =
    useRef(
      new Set(
        Array.isArray(completed)
          ? completed
          : []
      )
    );

  const drawColorRef =
    useRef(
      normalizeHexColor(
        activeMap?.drawColor
      ) || BASIC_COLORS[0]
    );

  const undoStackRef =
    useRef([]);

  const redoStackRef =
    useRef([]);

  const strokeBeforeRef =
    useRef(null);

  const strokeVisitedRef =
    useRef(new Set());

  const requestedTotal =
    Math.max(
      1,
      Number(totalCells) || 1
    );

  const {
    rows,
    cols,
    actualTotal,
  } =
    getGridDimensions(
      requestedTotal,
      imageRatio,
      gridMode,
      manualRows,
      manualCols
    );

  const progress =
    actualTotal > 0
      ? Math.min(
          100,
          Math.round(
            (completed.length /
              actualTotal) *
              100
          )
        )
      : 0;

  useEffect(() => {
    localStorage.setItem(
      LANGUAGE_KEY,
      language
    );
  }, [language]);

  useEffect(() => {
    if (
      screen === "editor" &&
      !activeMap
    ) {
      setScreen("maps");
      return;
    }

    localStorage.setItem(
      CURRENT_SCREEN_KEY,
      screen
    );
  }, [screen, activeMap]);

  useEffect(() => {
    drawColorRef.current =
      drawColor;
  }, [drawColor]);

  /*
   * Загрузка карт из Supabase.
   *
   * Если в Supabase пока нет карт, но в старом
   * localStorage есть карты, переносим их туда.
   */
  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      setMapsLoading(false);
      setMaps([]);
      setActiveMapId(null);
      return;
    }

    let cancelled = false;

    async function loadMaps() {
      setMapsLoading(true);

      const {
        data,
        error,
      } = await supabase
        .from("maps")
        .select(
          "id, user_id, name, data, created_at, updated_at"
        )
        .eq("user_id", user.id)
        .order("created_at", {
          ascending: true,
        });

      if (error) {
        console.error(
          "Не удалось загрузить карты из Supabase:",
          error
        );

        if (!cancelled) {
          setMaps(
            initialData.maps
          );

          setActiveMapId(
            initialData.activeMap?.id ||
              null
          );

          setMapsLoading(false);
        }

        return;
      }

      let remoteMaps =
        Array.isArray(data)
          ? data.map(mapFromSupabaseRow)
          : [];

      /*
       * Одноразовая миграция старых локальных карт.
       *
       * Важно: старые ID могли быть не UUID,
       * поэтому для Supabase создаём новые UUID.
       */
      if (
        remoteMaps.length === 0 &&
        initialData.maps.length > 0
      ) {
        const oldMaps =
          initialData.maps;

        const oldActiveId =
          localStorage.getItem(
            ACTIVE_MAP_KEY
          );

        const idMap = new Map();

        const mapsForInsert =
          oldMaps.map((oldMap) => {
            const newId =
              createMapId();

            idMap.set(
              oldMap.id,
              newId
            );

            return normalizeMap({
              ...oldMap,
              id: newId,
            });
          });

        const rowsToInsert =
          mapsForInsert.map(
            (map) =>
              mapToSupabaseRow(
                map,
                user.id
              )
          );

        const {
          data: insertedData,
          error: insertError,
        } =
          await supabase
            .from("maps")
            .insert(rowsToInsert)
            .select(
              "id, user_id, name, data, created_at, updated_at"
            );

        if (insertError) {
          console.error(
            "Не удалось перенести локальные карты в Supabase:",
            insertError
          );

          if (!cancelled) {
            setMaps(oldMaps);
            setActiveMapId(
              oldActiveId ||
                oldMaps[0]?.id ||
                null
            );
            setMapsLoading(false);
          }

          return;
        }

        remoteMaps =
          Array.isArray(
            insertedData
          )
            ? insertedData.map(
                mapFromSupabaseRow
              )
            : mapsForInsert;

        const newActiveId =
          idMap.get(oldActiveId) ||
          remoteMaps[0]?.id ||
          null;

        if (newActiveId) {
          localStorage.setItem(
            ACTIVE_MAP_KEY,
            newActiveId
          );
        }

        localStorage.removeItem(
          STORAGE_KEY
        );

        localStorage.removeItem(
          "mm-current-map"
        );

        if (!cancelled) {
          setMaps(remoteMaps);
          setActiveMapId(
            newActiveId
          );
          setMapsLoading(false);
        }

        return;
      }

      const savedActiveId =
        localStorage.getItem(
          ACTIVE_MAP_KEY
        );

      const activeRemoteMap =
        remoteMaps.find(
          (map) =>
            map.id ===
            savedActiveId
        ) ||
        remoteMaps[0] ||
        null;

      if (
        !cancelled
      ) {
        setMaps(remoteMaps);

        setActiveMapId(
          activeRemoteMap?.id ||
            null
        );

        if (
          activeRemoteMap?.id
        ) {
          localStorage.setItem(
            ACTIVE_MAP_KEY,
            activeRemoteMap.id
          );
        } else {
          localStorage.removeItem(
            ACTIVE_MAP_KEY
          );
        }

        setMapsLoading(false);
      }
    }

    loadMaps();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  function clearHistory() {
    undoStackRef.current = [];
    redoStackRef.current = [];
  }

  function sameCells(a, b) {
    if (a.length !== b.length) {
      return false;
    }

    const aSet = new Set(a);
    const bSet = new Set(b);

    if (aSet.size !== bSet.size) {
      return false;
    }

    for (const value of aSet) {
      if (!bSet.has(value)) {
        return false;
      }
    }

    return true;
  }

  function pushHistory(before, after) {
    const beforeArray = [...before];
    const afterArray = [...after];

    if (
      sameCells(
        beforeArray,
        afterArray
      )
    ) {
      return;
    }

    undoStackRef.current.push({
      before: beforeArray,
      after: afterArray,
    });

    if (
      undoStackRef.current.length >
      50
    ) {
      undoStackRef.current.shift();
    }

    redoStackRef.current = [];
  }

  function setCompletedDirectly(
    nextCompleted
  ) {
    const normalized = [
      ...new Set(nextCompleted),
    ];

    completedRef.current =
      new Set(normalized);

    setCompleted(normalized);
  }

  function selectDrawColor(color) {
    const normalizedColor =
      normalizeHexColor(color);

    if (!normalizedColor) {
      return;
    }

    setDrawColor(
      normalizedColor
    );

    setNewColor(
      normalizedColor
    );

    drawColorRef.current =
      normalizedColor;
  }

  function addCustomColor() {
    const color =
      normalizeHexColor(
        newColor
      );

    if (!color) {
      return;
    }

    if (
      BASIC_COLORS.includes(color)
    ) {
      selectDrawColor(color);
      return;
    }

    setCustomColors(
      (previousColors) => {
        if (
          previousColors.includes(
            color
          )
        ) {
          return previousColors;
        }

        return [
          ...previousColors,
          color,
        ];
      }
    );

    selectDrawColor(color);
  }

  function deleteCustomColor(color) {
    if (
      BASIC_COLORS.includes(color)
    ) {
      return;
    }

    setCustomColors(
      (previousColors) =>
        previousColors.filter(
          (item) =>
            item !== color
        )
    );

    if (
      drawColor === color
    ) {
      const fallback =
        BASIC_COLORS[0];

      setDrawColor(
        fallback
      );

      setNewColor(
        fallback
      );

      drawColorRef.current =
        fallback;
    }
  }

  function handleCustomColorContextMenu(
    event,
    color
  ) {
    event.preventDefault();
    event.stopPropagation();

    deleteCustomColor(color);
  }

  function undo() {
    if (
      mapType !== "free" ||
      isDrawingRef.current
    ) {
      return;
    }

    const action =
      undoStackRef.current.pop();

    if (!action) {
      return;
    }

    redoStackRef.current.push(
      action
    );

    setCompletedDirectly(
      action.before
    );
  }

  function redo() {
    if (
      mapType !== "free" ||
      isDrawingRef.current
    ) {
      return;
    }

    const action =
      redoStackRef.current.pop();

    if (!action) {
      return;
    }

    undoStackRef.current.push(
      action
    );

    setCompletedDirectly(
      action.after
    );
  }

  /*
   * Синхронизируем текущий редактор с объектом карты
   * в памяти React.
   */
  useEffect(() => {
    if (!activeMapId) {
      return;
    }

    setMaps((prevMaps) =>
      prevMaps.map((map) =>
        map.id === activeMapId
          ? {
              ...map,
              mapType,
              gridMode,
              completed,
              image,
              colors,
              imageRatio,
              totalCells,
              manualRows,
              manualCols,
              showImage,
              description,
              drawColor,
              customColors,
            }
          : map
      )
    );
  }, [
    activeMapId,
    mapType,
    gridMode,
    completed,
    image,
    colors,
    imageRatio,
    totalCells,
    manualRows,
    manualCols,
    showImage,
    description,
    drawColor,
    customColors,
  ]);

  useEffect(() => {
    if (activeMapId) {
      localStorage.setItem(
        ACTIVE_MAP_KEY,
        activeMapId
      );
    } else {
      localStorage.removeItem(
        ACTIVE_MAP_KEY
      );
    }
  }, [activeMapId]);

  useEffect(() => {
    completedRef.current =
      new Set(completed);

    drawCanvas();
  }, [
    completed,
    colors,
    showImage,
    mapType,
    image,
    rows,
    cols,
    drawColor,
  ]);

  useEffect(() => {
    const handlePointerUp = () => {
      finishStroke();
    };

    const handlePointerCancel = () => {
      finishStroke();
    };

    window.addEventListener(
      "pointerup",
      handlePointerUp
    );

    window.addEventListener(
      "pointercancel",
      handlePointerCancel
    );

    return () => {
      window.removeEventListener(
        "pointerup",
        handlePointerUp
      );

      window.removeEventListener(
        "pointercancel",
        handlePointerCancel
      );
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const target =
        event.target;

      const isTextField =
        target instanceof
          HTMLInputElement ||
        target instanceof
          HTMLTextAreaElement ||
        target?.isContentEditable;

      if (isTextField) {
        return;
      }

      if (
        event.ctrlKey &&
        event.key.toLowerCase() ===
          "z"
      ) {
        event.preventDefault();
        undo();
        return;
      }

      if (
        event.ctrlKey &&
        event.key.toLowerCase() ===
          "y"
      ) {
        event.preventDefault();
        redo();
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [mapType]);

  useEffect(() => {
    if (!isRenameOpen) {
      return;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        closeRenameModal();
      }

      if (event.key === "Enter") {
        saveRename();
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [
    isRenameOpen,
    renameValue,
  ]);

  useEffect(() => {
    if (!isDeleteOpen) {
      return;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        closeDeleteModal();
      }

      if (event.key === "Enter") {
        confirmDeleteMap();
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [
    isDeleteOpen,
    mapToDelete,
  ]);

  function drawGridLines(
    ctx,
    rect,
    cellWidth,
    cellHeight
  ) {
    ctx.save();

    ctx.globalAlpha = 1;
    ctx.strokeStyle =
      "rgba(0, 0, 0, 0.14)";
    ctx.lineWidth = 1;

    ctx.beginPath();

    for (
      let col = 1;
      col < cols;
      col++
    ) {
      const x =
        col * cellWidth;

      ctx.moveTo(x, 0);
      ctx.lineTo(
        x,
        rect.height
      );
    }

    for (
      let row = 1;
      row < rows;
      row++
    ) {
      const y =
        row * cellHeight;

      ctx.moveTo(0, y);
      ctx.lineTo(
        rect.width,
        y
      );
    }

    ctx.stroke();
    ctx.restore();
  }

  function drawCanvas() {
    const canvas =
      canvasRef.current;

    if (!canvas) {
      return;
    }

    const rect =
      canvas.getBoundingClientRect();

    if (
      !rect.width ||
      !rect.height
    ) {
      return;
    }

    const dpr =
      window.devicePixelRatio ||
      1;

    const targetWidth =
      Math.round(
        rect.width * dpr
      );

    const targetHeight =
      Math.round(
        rect.height * dpr
      );

    if (
      canvas.width !==
        targetWidth ||
      canvas.height !==
        targetHeight
    ) {
      canvas.width =
        targetWidth;

      canvas.height =
        targetHeight;
    }

    const ctx =
      canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    ctx.setTransform(
      dpr,
      0,
      0,
      dpr,
      0,
      0
    );

    ctx.clearRect(
      0,
      0,
      rect.width,
      rect.height
    );

    const cellWidth =
      rect.width / cols;

    const cellHeight =
      rect.height / rows;

    const activeCells =
      completedRef.current;

    for (
      let index = 0;
      index < actualTotal;
      index++
    ) {
      const row =
        Math.floor(
          index / cols
        );

      const col =
        index % cols;

      const x =
        col * cellWidth;

      const y =
        row * cellHeight;

      const isActive =
        activeCells.has(index);

      if (
        mapType === "free"
      ) {
        ctx.globalAlpha = 1;

        const color =
          colors[index] ||
          BASIC_COLORS[0];

        ctx.fillStyle =
          isActive
            ? color
            : "#eeeeee";

        ctx.fillRect(
          x,
          y,
          cellWidth,
          cellHeight
        );

        continue;
      }

      let color = "#e5e5e5";
      let alpha = 1;

      if (
        mapType === "image" &&
        image &&
        colors[index]
      ) {
        if (isActive) {
          color = colors[index];
        } else if (
          showImage
        ) {
          color = colors[index];
          alpha = 0.35;
        }
      }

      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;

      ctx.fillRect(
        x,
        y,
        cellWidth,
        cellHeight
      );
    }

    ctx.globalAlpha = 1;

    drawGridLines(
      ctx,
      rect,
      cellWidth,
      cellHeight
    );

    ctx.globalAlpha = 1;
  }

  useEffect(() => {
    drawCanvas();

    const handleResize = () => {
      drawCanvas();
    };

    window.addEventListener(
      "resize",
      handleResize
    );

    return () => {
      window.removeEventListener(
        "resize",
        handleResize
      );
    };
  }, [
    rows,
    cols,
    actualTotal,
    colors,
    image,
    showImage,
    mapType,
    drawColor,
  ]);

  function drawSingleCell(
    index,
    mode
  ) {
    const canvas =
      canvasRef.current;

    if (!canvas) {
      return;
    }

    const rect =
      canvas.getBoundingClientRect();

    if (
      !rect.width ||
      !rect.height
    ) {
      return;
    }

    const ctx =
      canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    const dpr =
      window.devicePixelRatio ||
      1;

    const cellWidth =
      rect.width / cols;

    const cellHeight =
      rect.height / rows;

    const row =
      Math.floor(
        index / cols
      );

    const col =
      index % cols;

    if (
      row < 0 ||
      row >= rows ||
      col < 0 ||
      col >= cols
    ) {
      return;
    }

    const x =
      col * cellWidth;

    const y =
      row * cellHeight;

    ctx.setTransform(
      dpr,
      0,
      0,
      dpr,
      0,
      0
    );

    if (
      mapType === "free"
    ) {
      ctx.globalAlpha = 1;

      if (mode === "draw") {
        ctx.fillStyle =
          drawColorRef.current;

        ctx.fillRect(
          x,
          y,
          cellWidth,
          cellHeight
        );
      } else {
        ctx.fillStyle =
          "#eeeeee";

        ctx.fillRect(
          x,
          y,
          cellWidth,
          cellHeight
        );
      }
    } else {
      let color = "#e5e5e5";
      let alpha = 1;

      if (
        image &&
        colors[index]
      ) {
        if (
          mode === "draw"
        ) {
          color = colors[index];
        } else if (
          showImage
        ) {
          color = colors[index];
          alpha = 0.35;
        }
      }

      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;

      ctx.fillRect(
        x,
        y,
        cellWidth,
        cellHeight
      );
    }

    ctx.globalAlpha = 1;

    ctx.save();

    ctx.strokeStyle =
      "rgba(0, 0, 0, 0.14)";

    ctx.lineWidth = 1;

    ctx.beginPath();

    ctx.moveTo(x, y);
    ctx.lineTo(
      x + cellWidth,
      y
    );

    ctx.moveTo(x, y);
    ctx.lineTo(
      x,
      y + cellHeight
    );

    ctx.moveTo(
      x + cellWidth,
      y
    );

    ctx.lineTo(
      x + cellWidth,
      y + cellHeight
    );

    ctx.moveTo(
      x,
      y + cellHeight
    );

    ctx.lineTo(
      x + cellWidth,
      y + cellHeight
    );

    ctx.stroke();
    ctx.restore();
  }

  function processImage(
    img,
    cellCount = requestedTotal,
    ratio = imageRatio,
    processGridMode = gridMode,
    processRows = manualRows,
    processCols = manualCols
  ) {
    const {
      rows: imageRows,
      cols: imageCols,
    } =
      getGridDimensions(
        cellCount,
        ratio,
        processGridMode,
        processRows,
        processCols
      );

    const canvas =
      document.createElement(
        "canvas"
      );

    canvas.width =
      imageCols;

    canvas.height =
      imageRows;

    const ctx =
      canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    ctx.drawImage(
      img,
      0,
      0,
      imageCols,
      imageRows
    );

    const imageData =
      ctx.getImageData(
        0,
        0,
        imageCols,
        imageRows
      );

    const newColors =
      new Array(
        imageCols *
          imageRows
      );

    for (
      let i = 0;
      i < newColors.length;
      i++
    ) {
      const pixel =
        i * 4;

      newColors[i] =
        `rgb(${imageData.data[pixel]}, ${imageData.data[pixel + 1]}, ${imageData.data[pixel + 2]})`;
    }

    setColors(newColors);
  }

  function handleMapTypeChange(
    type
  ) {
    finishStroke();

    setMapType(type);

    setCompletedDirectly([]);

    clearHistory();

    if (type === "free") {
      setShowImage(false);
      setColors([]);
    } else {
      setShowImage(true);
    }
  }

  function handleGridModeChange(
    mode
  ) {
    finishStroke();

    const nextMode =
      mode === "manual"
        ? "manual"
        : "auto";

    if (
      nextMode === "manual"
    ) {
      setManualRows(
        String(rows)
      );

      setManualCols(
        String(cols)
      );
    }

    setGridMode(nextMode);

    const nextRows =
      nextMode === "manual"
        ? rows
        : manualRows;

    const nextCols =
      nextMode === "manual"
        ? cols
        : manualCols;

    const newDimensions =
      getGridDimensions(
        requestedTotal,
        imageRatio,
        nextMode,
        nextRows,
        nextCols
      );

    const nextCompleted =
      [
        ...completedRef.current,
      ].filter(
        (index) =>
          index <
          newDimensions.actualTotal
      );

    completedRef.current =
      new Set(nextCompleted);

    setCompleted(
      nextCompleted
    );

    clearHistory();

    if (
      mapType === "image" &&
      image
    ) {
      const img =
        new Image();

      img.onload = () => {
        processImage(
          img,
          requestedTotal,
          imageRatio,
          nextMode,
          nextRows,
          nextCols
        );
      };

      img.src = image;
    }
  }

  function handleManualRowsChange(
    event
  ) {
    const value =
      event.target.value;

    setManualRows(value);

    const newRows =
      Math.max(
        1,
        Number(value) || 1
      );

    const newCols =
      Math.max(
        1,
        Number(manualCols) || 1
      );

    const newActualTotal =
      newRows * newCols;

    const nextCompleted =
      [
        ...completedRef.current,
      ].filter(
        (index) =>
          index <
          newActualTotal
      );

    completedRef.current =
      new Set(nextCompleted);

    setCompleted(
      nextCompleted
    );

    clearHistory();

    if (
      mapType === "image" &&
      image
    ) {
      const img =
        new Image();

      img.onload = () => {
        processImage(
          img,
          requestedTotal,
          imageRatio,
          "manual",
          newRows,
          newCols
        );
      };

      img.src = image;
    }
  }

  function handleManualColsChange(
    event
  ) {
    const value =
      event.target.value;

    setManualCols(value);

    const newCols =
      Math.max(
        1,
        Number(value) || 1
      );

    const newRows =
      Math.max(
        1,
        Number(manualRows) || 1
      );

    const newActualTotal =
      newRows * newCols;

    const nextCompleted =
      [
        ...completedRef.current,
      ].filter(
        (index) =>
          index <
          newActualTotal
      );

    completedRef.current =
      new Set(nextCompleted);

    setCompleted(
      nextCompleted
    );

    clearHistory();

    if (
      mapType === "image" &&
      image
    ) {
      const img =
        new Image();

      img.onload = () => {
        processImage(
          img,
          requestedTotal,
          imageRatio,
          "manual",
          newRows,
          newCols
        );
      };

      img.src = image;
    }
  }

  function handleImageChange(
    event
  ) {
    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    const reader =
      new FileReader();

    reader.onload = (e) => {
      const img =
        new Image();

      img.onload = () => {
        const ratio =
          img.width /
          img.height;

        finishStroke();

        setMapType("image");

        setImage(
          e.target.result
        );

        setImageRatio(
          ratio
        );

        setCompletedDirectly([]);

        clearHistory();

        setShowImage(true);

        processImage(
          img,
          requestedTotal,
          ratio,
          gridMode,
          manualRows,
          manualCols
        );
      };

      img.src =
        e.target.result;
    };

    reader.readAsDataURL(file);
  }

  function clearImage() {
    finishStroke();

    setImage(null);
    setColors([]);
    setImageRatio(1);
    setCompletedDirectly([]);
    setShowImage(true);

    clearHistory();
  }

  function handleTotalCellsChange(
    event
  ) {
    const value =
      event.target.value;

    setTotalCells(value);

    const newTotal =
      Math.max(
        1,
        Number(value) || 1
      );

    if (
      gridMode === "manual"
    ) {
      clearHistory();
      return;
    }

    const {
      actualTotal:
        newActualTotal,
    } =
      getGridDimensions(
        newTotal,
        imageRatio,
        "auto",
        manualRows,
        manualCols
      );

    const next =
      [
        ...completedRef.current,
      ].filter(
        (index) =>
          index <
          newActualTotal
      );

    completedRef.current =
      new Set(next);

    setCompleted(next);

    clearHistory();

    if (
      mapType === "image" &&
      image
    ) {
      const img =
        new Image();

      img.onload = () => {
        processImage(
          img,
          newTotal,
          imageRatio,
          "auto",
          manualRows,
          manualCols
        );
      };

      img.src = image;
    }
  }

  function getCellFromPointerEvent(
    event
  ) {
    const canvas =
      canvasRef.current;

    if (!canvas) {
      return null;
    }

    const rect =
      canvas.getBoundingClientRect();

    const x =
      event.clientX -
      rect.left;

    const y =
      event.clientY -
      rect.top;

    if (
      x < 0 ||
      y < 0 ||
      x >= rect.width ||
      y >= rect.height
    ) {
      return null;
    }

    const cellWidth =
      rect.width / cols;

    const cellHeight =
      rect.height / rows;

    const col =
      Math.floor(
        x / cellWidth
      );

    const row =
      Math.floor(
        y / cellHeight
      );

    if (
      col < 0 ||
      col >= cols ||
      row < 0 ||
      row >= rows
    ) {
      return null;
    }

    const index =
      row * cols + col;

    if (
      index < 0 ||
      index >= actualTotal
    ) {
      return null;
    }

    return index;
  }

  function applyCells(
    indices,
    mode
  ) {
    if (
      !indices ||
      indices.length === 0
    ) {
      return;
    }

    const nextSet =
      new Set(
        completedRef.current
      );

    for (
      const index of indices
    ) {
      if (mode === "draw") {
        nextSet.add(index);
      } else {
        nextSet.delete(index);
      }
    }

    if (
      mapType === "free"
    ) {
      setColors(
        (previousColors) => {
          const nextColors = [
            ...previousColors,
          ];

          for (
            const index of indices
          ) {
            if (
              mode === "draw"
            ) {
              nextColors[index] =
                drawColorRef.current;
            } else {
              delete nextColors[index];
            }
          }

          return nextColors;
        }
      );
    }

    completedRef.current =
      nextSet;

    setCompleted([
      ...nextSet,
    ]);
  }

  function startStroke(
    index,
    mode,
    pointerId
  ) {
    if (
      isDrawingRef.current
    ) {
      finishStroke();
    }

    isDrawingRef.current =
      true;

    drawModeRef.current =
      mode;

    previousCellRef.current =
      index;

    activePointerIdRef.current =
      pointerId;

    strokeBeforeRef.current =
      new Set(
        completedRef.current
      );

    strokeVisitedRef.current =
      new Set();

    redoStackRef.current = [];

    strokeVisitedRef.current.add(
      index
    );

    applyCells(
      [index],
      mode
    );

    drawSingleCell(
      index,
      mode
    );

    setIsDrawing(true);
    setDrawMode(mode);
  }

  function continueStroke(
    index
  ) {
    if (
      !isDrawingRef.current
    ) {
      return;
    }

    const previousIndex =
      previousCellRef.current;

    if (
      previousIndex === null
    ) {
      previousCellRef.current =
        index;

      return;
    }

    if (
      index === previousIndex
    ) {
      return;
    }

    const lineCells =
      getLineCells(
        previousIndex,
        index,
        cols,
        rows
      );

    const newCells =
      lineCells.filter(
        (cell) =>
          !strokeVisitedRef.current.has(
            cell
          )
      );

    for (
      const cell of lineCells
    ) {
      strokeVisitedRef.current.add(
        cell
      );
    }

    if (
      newCells.length > 0
    ) {
      const mode =
        drawModeRef.current;

      applyCells(
        newCells,
        mode
      );

      for (
        const cell of newCells
      ) {
        drawSingleCell(
          cell,
          mode
        );
      }
    }

    previousCellRef.current =
      index;
  }

  function finishStroke() {
    if (
      !isDrawingRef.current
    ) {
      return;
    }

    isDrawingRef.current =
      false;

    setIsDrawing(false);

    previousCellRef.current =
      null;

    const before =
      strokeBeforeRef.current;

    if (before) {
      const after =
        new Set(
          completedRef.current
        );

      pushHistory(
        before,
        after
      );
    }

    strokeBeforeRef.current =
      null;

    strokeVisitedRef.current =
      new Set();

    activePointerIdRef.current =
      null;
  }

  function handlePointerDown(
    event
  ) {
    event.preventDefault();

    const canvas =
      canvasRef.current;

    if (!canvas) {
      return;
    }

    const index =
      getCellFromPointerEvent(
        event
      );

    if (index === null) {
      return;
    }

    const mode =
      event.button === 2
        ? "erase"
        : "draw";

    if (
      canvas.setPointerCapture
    ) {
      try {
        canvas.setPointerCapture(
          event.pointerId
        );
      } catch {
        // Ничего не делаем.
      }
    }

    startStroke(
      index,
      mode,
      event.pointerId
    );
  }

  function handlePointerMove(
    event
  ) {
    if (
      !isDrawingRef.current
    ) {
      return;
    }

    const activePointerId =
      activePointerIdRef.current;

    if (
      activePointerId !== null &&
      event.pointerId !==
        activePointerId
    ) {
      return;
    }

    let events = [];

    if (
      typeof event.getCoalescedEvents ===
      "function"
    ) {
      const coalesced =
        event.getCoalescedEvents();

      if (
        coalesced &&
        coalesced.length > 0
      ) {
        events = coalesced;
      }
    }

    let lastProcessedIndex =
      null;

    for (
      const moveEvent of events
    ) {
      const index =
        getCellFromPointerEvent(
          moveEvent
        );

      if (index !== null) {
        continueStroke(index);
        lastProcessedIndex =
          index;
      }
    }

    const currentIndex =
      getCellFromPointerEvent(
        event
      );

    if (
      currentIndex !== null &&
      currentIndex !==
        lastProcessedIndex
    ) {
      continueStroke(
        currentIndex
      );
    }
  }

  function handlePointerUp(
    event
  ) {
    const activePointerId =
      activePointerIdRef.current;

    if (
      activePointerId !== null &&
      event.pointerId !==
        activePointerId
    ) {
      return;
    }

    const index =
      getCellFromPointerEvent(
        event
      );

    if (index !== null) {
      continueStroke(index);
    }

    const canvas =
      canvasRef.current;

    if (
      canvas &&
      canvas.releasePointerCapture
    ) {
      try {
        if (
          canvas.hasPointerCapture?.(
            event.pointerId
          )
        ) {
          canvas.releasePointerCapture(
            event.pointerId
          );
        }
      } catch {
        // Ничего не делаем.
      }
    }

    finishStroke();
  }

  function handlePointerCancel(
    event
  ) {
    const canvas =
      canvasRef.current;

    if (
      canvas &&
      canvas.releasePointerCapture
    ) {
      try {
        if (
          canvas.hasPointerCapture?.(
            event.pointerId
          )
        ) {
          canvas.releasePointerCapture(
            event.pointerId
          );
        }
      } catch {
        // Ничего не делаем.
      }
    }

    finishStroke();
  }

  function clearProgress() {
    finishStroke();

    const before =
      new Set(
        completedRef.current
      );

    if (
      before.size === 0
    ) {
      return;
    }

    setCompletedDirectly([]);

    if (
      mapType === "free"
    ) {
      setColors(
        (previousColors) => {
          const nextColors = [
            ...previousColors,
          ];

          for (
            const index of before
          ) {
            delete nextColors[index];
          }

          return nextColors;
        }
      );
    }

    pushHistory(
      before,
      new Set()
    );
  }

  function downloadMap() {
    if (!activeMap) {
      return;
    }

    const canvas =
      canvasRef.current;

    if (!canvas) {
      return;
    }

    const safeName =
      (activeMap.name ||
        "MM-map")
        .replace(
          /[\\/:*?"<>|]/g,
          ""
        )
        .trim();

    const link =
      document.createElement("a");

    link.download =
      `${safeName || "MM-map"}.png`;

    link.href =
      canvas.toDataURL(
        "image/png"
      );

    link.click();
  }

  async function saveMapToSupabase(
    map
  ) {
    if (!user || !map) {
      return {
        error: new Error(
          "Пользователь не авторизован."
        ),
      };
    }

    const row =
      mapToSupabaseRow(
        map,
        user.id
      );

    const {
      data,
      error,
    } =
      await supabase
        .from("maps")
        .upsert(
          row,
          {
            onConflict: "id",
          }
        )
        .select(
          "id, user_id, name, data, created_at, updated_at"
        )
        .single();

    if (error) {
      console.error(
        "Ошибка сохранения карты:",
        error
      );

      return {
        error,
      };
    }

    return {
      map: mapFromSupabaseRow(
        data
      ),
      error: null,
    };
  }

  async function saveActiveMap() {
    if (!activeMapId || !user) {
      return;
    }

    finishStroke();

    const savedMap =
      normalizeMap({
        ...activeMap,
        mapType,
        gridMode,
        completed: [
          ...completedRef.current,
        ],
        image,
        colors,
        imageRatio,
        totalCells,
        manualRows,
        manualCols,
        showImage,
        description,
        drawColor,
        customColors,
      });

    setMaps(
      (previousMaps) =>
        previousMaps.map(
          (map) =>
            map.id === activeMapId
              ? savedMap
              : map
        )
    );

    const {
      map: remoteMap,
      error,
    } =
      await saveMapToSupabase(
        savedMap
      );

    if (error) {
      setSaveStatus("error");

      window.setTimeout(
        () =>
          setSaveStatus(""),
        1800
      );

      return;
    }

    if (remoteMap) {
      setMaps(
        (previousMaps) =>
          previousMaps.map(
            (map) =>
              map.id ===
              activeMapId
                ? remoteMap
                : map
          )
      );
    }

    localStorage.setItem(
      ACTIVE_MAP_KEY,
      activeMapId
    );

    setSaveStatus("saved");

    window.setTimeout(
      () => setSaveStatus(""),
      1800
    );
  }

  function openCreateModal() {
    setNewMapName("");
    setNewMapType("free");
    setNewMapGridMode("auto");
    setNewMapCells("500");
    setNewMapRows("20");
    setNewMapCols("25");
    setIsCreateOpen(true);
  }

  function closeCreateModal() {
    setIsCreateOpen(false);
  }

  async function createMap() {
    if (!user) {
      return;
    }

    const name =
      newMapName.trim() ||
      "Новая карта";

    const cells =
      Math.max(
        1,
        Number(newMapCells) || 500
      );

    const rows =
      Math.max(
        1,
        Number(newMapRows) || 1
      );

    const cols =
      Math.max(
        1,
        Number(newMapCols) || 1
      );

    const newMap =
      normalizeMap({
        id: createMapId(),
        name,
        mapType: newMapType,
        gridMode: newMapGridMode,
        completed: [],
        image: null,
        colors: [],
        customColors: [],
        drawColor:
          BASIC_COLORS[0],
        imageRatio: 1,
        totalCells: String(cells),
        manualRows: String(rows),
        manualCols: String(cols),
        showImage:
          newMapType === "image",
        description: "",
      });

    finishStroke();

    const {
      map: savedMap,
      error,
    } =
      await saveMapToSupabase(
        newMap
      );

    if (error) {
      console.error(
        "Не удалось создать карту:",
        error
      );

      return;
    }

    const mapToUse =
      savedMap || newMap;

    setMaps(
      (prevMaps) => [
        ...prevMaps,
        mapToUse,
      ]
    );

    setActiveMapId(
      mapToUse.id
    );

    setMapType(
      mapToUse.mapType
    );

    setGridMode(
      mapToUse.gridMode
    );

    setCompletedDirectly([]);

    setImage(null);
    setColors([]);
    setImageRatio(1);

    setDrawColor(
      BASIC_COLORS[0]
    );

    drawColorRef.current =
      BASIC_COLORS[0];

    setCustomColors([]);

    setNewColor(
      BASIC_COLORS[0]
    );

    setTotalCells(
      mapToUse.totalCells
    );

    setManualRows(
      mapToUse.manualRows
    );

    setManualCols(
      mapToUse.manualCols
    );

    setShowImage(
      mapToUse.showImage
    );

    setDescription("");

    clearHistory();

    setIsCreateOpen(false);

    localStorage.setItem(
      ACTIVE_MAP_KEY,
      mapToUse.id
    );

    setScreen("editor");
  }

  function openMap(map) {
    finishStroke();

    setActiveMapId(
      map.id
    );

    setMapType(
      map.mapType
    );

    setGridMode(
      map.gridMode === "manual"
        ? "manual"
        : "auto"
    );

    const nextCompleted =
      Array.isArray(
        map.completed
      )
        ? map.completed
        : [];

    completedRef.current =
      new Set(nextCompleted);

    setCompleted(
      nextCompleted
    );

    setImage(
      typeof map.image ===
        "string"
        ? map.image
        : null
    );

    setColors(
      Array.isArray(
        map.colors
      )
        ? map.colors
        : []
    );

    setImageRatio(
      typeof map.imageRatio ===
        "number"
        ? map.imageRatio
        : 1
    );

    const nextDrawColor =
      normalizeHexColor(
        map.drawColor
      ) ||
      BASIC_COLORS[0];

    setDrawColor(
      nextDrawColor
    );

    drawColorRef.current =
      nextDrawColor;

    setNewColor(
      nextDrawColor
    );

    setCustomColors(
      Array.isArray(
        map.customColors
      )
        ? map.customColors
        : []
    );

    setTotalCells(
      typeof map.totalCells ===
        "string"
        ? map.totalCells
        : "500"
    );

    setManualRows(
      typeof map.manualRows ===
        "string"
        ? map.manualRows
        : "20"
    );

    setManualCols(
      typeof map.manualCols ===
        "string"
        ? map.manualCols
        : "25"
    );

    setShowImage(
      typeof map.showImage ===
        "boolean"
        ? map.showImage
        : true
    );

    setDescription(
      typeof map.description ===
        "string"
        ? map.description
        : ""
    );

    clearHistory();

    isDrawingRef.current =
      false;

    previousCellRef.current =
      null;

    strokeBeforeRef.current =
      null;

    strokeVisitedRef.current =
      new Set();

    activePointerIdRef.current =
      null;

    localStorage.setItem(
      ACTIVE_MAP_KEY,
      map.id
    );
  }

  function openRenameModal(map) {
    setRenameValue(
      map.name || ""
    );

    setRenameMapId(
      map.id
    );

    setIsRenameOpen(true);
  }

  function closeRenameModal() {
    setIsRenameOpen(false);
    setRenameValue("");
    setRenameMapId(null);
  }

  async function saveRename() {
    const name =
      renameValue.trim();

    if (
      !name ||
      !renameMapId ||
      !user
    ) {
      return;
    }

    const targetMap =
      maps.find(
        (map) =>
          map.id ===
          renameMapId
      );

    if (!targetMap) {
      return;
    }

    const renamedMap =
      normalizeMap({
        ...targetMap,
        name,
      });

    setMaps(
      (prevMaps) =>
        prevMaps.map(
          (map) =>
            map.id ===
            renameMapId
              ? renamedMap
              : map
        )
    );

    const {
      map: remoteMap,
      error,
    } =
      await saveMapToSupabase(
        renamedMap
      );

    if (error) {
      console.error(
        "Не удалось переименовать карту:",
        error
      );

      setMaps(
        (prevMaps) =>
          prevMaps.map(
            (map) =>
              map.id ===
              renameMapId
                ? targetMap
                : map
          )
      );

      return;
    }

    if (remoteMap) {
      setMaps(
        (prevMaps) =>
          prevMaps.map(
            (map) =>
              map.id ===
              renameMapId
                ? remoteMap
                : map
          )
      );
    }

    closeRenameModal();
  }

  function openDeleteModal(map) {
    setMapToDelete(map);
    setIsDeleteOpen(true);
  }

  function closeDeleteModal() {
    setIsDeleteOpen(false);
    setMapToDelete(null);
  }

  async function confirmDeleteMap() {
    if (
      !mapToDelete ||
      !user
    ) {
      return;
    }

    finishStroke();

    const mapId =
      mapToDelete.id;

    const {
      error,
    } =
      await supabase
        .from("maps")
        .delete()
        .eq("id", mapId)
        .eq("user_id", user.id);

    if (error) {
      console.error(
        "Не удалось удалить карту:",
        error
      );

      return;
    }

    const remainingMaps =
      maps.filter(
        (map) =>
          map.id !== mapId
      );

    if (
      remainingMaps.length === 0
    ) {
      setMaps([]);
      setActiveMapId(null);

      setMapType("free");
      setGridMode("auto");

      setCompletedDirectly([]);

      setImage(null);
      setColors([]);
      setImageRatio(1);

      setDrawColor(
        BASIC_COLORS[0]
      );

      drawColorRef.current =
        BASIC_COLORS[0];

      setCustomColors([]);

      setNewColor(
        BASIC_COLORS[0]
      );

      setTotalCells("500");
      setManualRows("20");
      setManualCols("25");
      setShowImage(false);
      setDescription("");

      clearHistory();

      localStorage.removeItem(
        ACTIVE_MAP_KEY
      );

      closeDeleteModal();

      setScreen("maps");

      return;
    }

    setMaps(
      remainingMaps
    );

    if (
      mapId === activeMapId
    ) {
      const nextMap =
        remainingMaps[0];

      openMap(nextMap);

      setScreen("editor");
    }

    closeDeleteModal();
  }

  if (authLoading) {
    return (
      <div className="auth-loading">
        Загрузка...
      </div>
    );
  }

  if (!user) {
    return (
      <Auth onAuth={setUser} />
    );
  }

  if (mapsLoading) {
    return (
      <div className="auth-loading">
        Загрузка карт...
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <button
          type="button"
          className="back-link"
          onClick={() =>
            setScreen("maps")
          }
        >
          ← {t("myMaps")}
        </button>

        <button
          type="button"
          className="editor-brand"
          onClick={() =>
            setScreen("home")
          }
          aria-label={t("home")}
        >
          <span className="brand-mark">
            MM
          </span>

          <span>
            {screen === "home"
              ? `MM / ${t("home")}`
              : screen === "maps"
                ? `MM / ${t("myMaps")}`
                : t("editor")}
          </span>
        </button>

        <div className="header-actions">
          <select
            className="language-select"
            value={language}
            onChange={(event) =>
              setLanguage(
                event.target.value
              )
            }
            aria-label="Language"
          >
            <option value="ru">
              Русский
            </option>

            <option value="en">
              English
            </option>

            <option value="es">
              Español
            </option>

            <option value="ja">
              日本語
            </option>

            <option value="de">
              Deutsch
            </option>

            <option value="fr">
              Français
            </option>

            <option value="it">
              Italiano
            </option>

            <option value="pt">
              Português
            </option>

            <option value="zh">
              中文
            </option>

            <option value="ko">
              한국어
            </option>
          </select>

          <button
            type="button"
            className="download-map-btn"
            onClick={
              downloadMap
            }
            disabled={
              screen !==
                "editor" ||
              !activeMap
            }
          >
            ↓ Скачать
          </button>

          <button
            type="button"
            className="save-map-btn"
            onClick={
              saveActiveMap
            }
            disabled={
              screen !==
                "editor" ||
              !activeMap
            }
          >
            {saveStatus ===
            "error"
              ? "Ошибка"
              : saveStatus
                ? t("saved")
                : t("save")}
          </button>
        </div>
      </header>

      {screen === "home" ? (
        <main className="home-page">
          <section className="landing-hero">
            <div className="landing-copy">
              <span className="landing-label">
                {t("progress")}
              </span>

              <h1>
                {t("hero")}
              </h1>

              <p>
                {t("heroText")}
              </p>

              <div className="home-actions">
                <button
                  type="button"
                  className="save-map-btn"
                  onClick={
                    openCreateModal
                  }
                >
                  {t("createMap")}
                </button>

                <button
                  type="button"
                  className="home-secondary-btn"
                  onClick={() =>
                    document
                      .getElementById(
                        "overview"
                      )
                      ?.scrollIntoView({
                        behavior:
                          "smooth",
                      })
                  }
                >
                  {t("preview")} ↓
                </button>
              </div>
            </div>

            <div
              className="hero-grid"
              aria-hidden="true"
            >
              {Array.from(
                {
                  length: 144,
                },
                (_, index) => (
                  <span
                    key={index}
                    className={
                      index % 13 < 5 ||
                      [
                        43,
                        54,
                        65,
                        76,
                        87,
                      ].includes(
                        index
                      )
                        ? "filled"
                        : ""
                    }
                  />
                )
              )}
            </div>
          </section>

          <section
            className="landing-demo"
            id="overview"
          >
            <div className="demo-copy">
              <span className="demo-number">
                01
              </span>

              <h2>
                {t("mapDescription")}
              </h2>

              <span className="landing-label">
                {t("preview")}
              </span>

              <p>
                {t("heroText")}
              </p>
            </div>

            <div className="demo-card">
              <div className="demo-card-title">
                30 {t("cells")}
              </div>

              <div className="demo-grid">
                {Array.from(
                  {
                    length: 104,
                  },
                  (_, index) => (
                    <span
                      key={index}
                      className={
                        index < 52 &&
                        index % 7 !== 2
                          ? "filled"
                          : ""
                      }
                    />
                  )
                )}
              </div>

              <div className="demo-metric">
                <strong>
                  50%
                </strong>

                <span>
                  52 / 104{" "}
                  {t("cells")}
                </span>
              </div>

              <div className="demo-line">
                <span>
                  01
                </span>

                <i>
                  <b />
                </i>

                <span>
                  30
                </span>
              </div>

              <p>
                {t("saved")}
              </p>
            </div>

            <div className="demo-note">
              {t("benefitThree")}
            </div>
          </section>

          <section
            className="idea-section"
            id="idea"
          >
            <span className="landing-label">
              {t("benefitOne")}
            </span>

            <h2>
              {t("hero")}
            </h2>

            <div className="idea-steps">
              <article>
                <span>
                  01
                </span>

                <h3>
                  {t("myMaps")}
                </h3>

                <p>
                  {t(
                    "mapDescription"
                  )}
                </p>
              </article>

              <article>
                <span>
                  02
                </span>

                <h3>
                  {t("brush")}
                </h3>

                <p>
                  {t("newCells")}
                </p>
              </article>

              <article>
                <span>
                  03
                </span>

                <h3>
                  {t("preview")}
                </h3>

                <p>
                  {t("heroText")}
                </p>
              </article>
            </div>
          </section>

          <section className="landing-final">
            <span className="landing-label">
              MM
            </span>

            <h2>
              {t("hero")}
            </h2>

            <p>
              {t("heroText")}
            </p>

            <button
              type="button"
              className="save-map-btn"
              onClick={
                openCreateModal
              }
            >
              {t("createMap")}
            </button>
          </section>

          <footer className="landing-footer">
            <strong>
              MM — Map Method
            </strong>

            <span>
              {t("hero")}
            </span>
          </footer>
        </main>
      ) : screen === "maps" ? (
  <section className="maps-page">
    <div className="maps-page-header">
      <div>
        <span className="workspace-type">MM</span>

        <h1>
          {t("myMaps")}
        </h1>
      </div>

      <button
        type="button"
        className="save-map-btn"
        onClick={openCreateModal}
      >
        + {t("newMap")}
      </button>
    </div>

    {maps.length === 0 ? (
      <div className="empty-maps">
        <div
          className="empty-maps-grid"
          aria-hidden="true"
        >
          {Array.from(
            { length: 36 },
            (_, index) => (
              <span
                key={index}
                className={
                  index % 7 === 0 ||
                  index % 11 === 0 ||
                  index === 16 ||
                  index === 17 ||
                  index === 23 ||
                  index === 24
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
          {t("mapsEmpty")}
        </h2>

        <p>
          {t("heroText")}
        </p>

        <button
          type="button"
          className="save-map-btn"
          onClick={openCreateModal}
        >
          + {t("createMap")}
        </button>
      </div>
    ) : (
      <div className="maps-list">
        {maps.map((map) => {
          const mapDimensions =
            getGridDimensions(
              Math.max(
                1,
                Number(map.totalCells) || 1
              ),
              map.imageRatio || 1,
              map.gridMode,
              map.manualRows,
              map.manualCols
            );

          const mapTotal =
            mapDimensions.actualTotal;

          const mapCompleted =
            Array.isArray(map.completed)
              ? map.completed.length
              : 0;

          const mapProgress =
            mapTotal > 0
              ? Math.min(
                  100,
                  Math.round(
                    (mapCompleted / mapTotal) *
                      100
                  )
                )
              : 0;

          return (
            <article
              className="map-card"
              key={map.id}
              onClick={() => {
                openMap(map);
                setScreen("editor");
              }}
            >
              <div className="map-card-preview">
                {map.mapType === "image" &&
                map.image ? (
                  <img
                    className="map-card-image"
                    src={map.image}
                    alt=""
                  />
                ) : (
                  <div
                    className="map-card-grid"
                    style={{
                      gridTemplateColumns: `repeat(${mapDimensions.cols}, minmax(0, 1fr))`,
                      aspectRatio: `${mapDimensions.cols} / ${mapDimensions.rows}`,
                    }}
                  >
                    {Array.from(
                      {
                        length:
                          mapDimensions.actualTotal,
                      },
                      (_, index) => {
                        const completed =
                          Array.isArray(
                            map.completed
                          ) &&
                          map.completed.includes(
                            index
                          );

                        const cellColor =
                          map.colors?.[index] ||
                          "#111111";

                        return (
                          <span
                            key={index}
                            className={
                              completed
                                ? "map-card-cell filled"
                                : "map-card-cell"
                            }
                            style={{
                              backgroundColor:
                                completed
                                  ? cellColor
                                  : undefined,
                            }}
                          />
                        );
                      }
                    )}
                  </div>
                )}
              </div>

              <div className="map-card-body">
                <div className="map-card-heading">
                  <div>
                    <strong>
                      {map.name}
                    </strong>

                    <span>
                      {map.mapType === "image"
                        ? t("imageMap")
                        : t("freeDrawing")}
                    </span>
                  </div>

                  <strong className="map-card-percent">
                    {mapProgress}%
                  </strong>
                </div>

                <div className="map-card-progress">
                  <i
                    style={{
                      width: `${mapProgress}%`,
                    }}
                  />
                </div>

                <div className="map-card-footer">
                  <span>
                    {mapCompleted} /{" "}
                    {mapTotal} {t("cells")}
                  </span>

                  <div className="map-card-actions">
                    <button
                      type="button"
                      className="tool-btn"
                      onClick={(event) => {
                        event.stopPropagation();

                        openMap(map);
                        setScreen("editor");
                      }}
                    >
                      {t("open")}
                    </button>

                    <button
                      type="button"
                      className="tool-btn"
                      onClick={(event) => {
                        event.stopPropagation();

                        openRenameModal(map);
                      }}
                    >
                      {t("edit")}
                    </button>

                    <button
                      type="button"
                      className="tool-btn danger-action"
                      onClick={(event) => {
                        event.stopPropagation();

                        openDeleteModal(map);
                      }}
                    >
                      {t("delete")}
                    </button>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    )}
  </section>
) : (
  <main className="editor-layout">
          <aside className="left-sidebar">
            <section className="sidebar-section map-data-section">
              <div className="section-heading">
                {t("mapData")}
              </div>

              <label
                className="field-label"
                htmlFor="activeMap"
              >
                {t("name")}
              </label>

              <select
                id="activeMap"
                className="map-select"
                value={
                  activeMapId || ""
                }
                onChange={(event) => {
                  const map =
                    maps.find(
                      (item) =>
                        item.id ===
                        event.target
                          .value
                    );

                  if (map) {
                    openMap(map);
                  }
                }}
              >
                {maps.length ===
                0 ? (
                  <option value="">
                    {t("newMap")}
                  </option>
                ) : (
                  maps.map((map) => (
                    <option
                      key={
                        map.id
                      }
                      value={
                        map.id
                      }
                    >
                      {map.name}
                    </option>
                  ))
                )}
              </select>

              <span className="field-label">
                {t("description")}
              </span>

              <input
                className="map-description"
                value={
                  description
                }
                placeholder={t(
                  "mapDescription"
                )}
                onChange={(event) =>
                  setDescription(
                    event.target
                      .value
                  )
                }
              />

              <div className="map-actions">
                <button
                  type="button"
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
                      type="button"
                      className="text-action"
                      onClick={() =>
                        openRenameModal(
                          activeMap
                        )
                      }
                    >
                      {t("edit")}
                    </button>

                    <button
                      type="button"
                      className="text-action danger-action"
                      onClick={() =>
                        openDeleteModal(
                          activeMap
                        )
                      }
                    >
                      {t("delete")}
                    </button>
                  </>
                )}
              </div>
            </section>

            <section className="sidebar-section">
              <div className="section-heading">
                {t("canvasSize")}
              </div>

              <div className="segmented-control">
                <button
                  type="button"
                  className={
                    gridMode ===
                    "auto"
                      ? "map-type-btn active"
                      : "map-type-btn"
                  }
                  onClick={() =>
                    handleGridModeChange(
                      "auto"
                    )
                  }
                >
                  {t("auto")}
                </button>

                <button
                  type="button"
                  className={
                    gridMode ===
                    "manual"
                      ? "map-type-btn active"
                      : "map-type-btn"
                  }
                  onClick={() =>
                    handleGridModeChange(
                      "manual"
                    )
                  }
                >
                  {t("manual")}
                </button>
              </div>

              {gridMode ===
              "auto" ? (
                <div className="compact-field">
                  <label htmlFor="totalCells">
                    {t("cells")}
                  </label>

                  <input
                    id="totalCells"
                    type="number"
                    min="1"
                    value={
                      totalCells
                    }
                    onChange={
                      handleTotalCellsChange
                    }
                  />
                </div>
              ) : (
                <div className="manual-grid-controls compact-grid-fields">
                  <div className="compact-field">
                    <label htmlFor="manualRows">
                      {t("rows")}
                    </label>

                    <input
                      id="manualRows"
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
                    <label htmlFor="manualCols">
                      {t("columns")}
                    </label>

                    <input
                      id="manualCols"
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
                </div>
              )}

              <div className="grid-info">
                {t("grid")}{" "}
                {rows} ×{" "}
                {cols} ·{" "}
                {actualTotal}{" "}
                {t("cells")}
              </div>
            </section>

            <section className="sidebar-section">
              <div className="section-heading">
                {t("tools")}
              </div>

              <div className="tool-stack">
                <div className="map-type tool-type">
                  <button
                    type="button"
                    className={
                      mapType ===
                      "free"
                        ? "map-type-btn active"
                        : "map-type-btn"
                    }
                    onClick={() =>
                      handleMapTypeChange(
                        "free"
                      )
                    }
                  >
                    {t("brush")}
                  </button>

                  <button
                    type="button"
                    className={
                      mapType ===
                      "image"
                        ? "map-type-btn active"
                        : "map-type-btn"
                    }
                    onClick={() =>
                      handleMapTypeChange(
                        "image"
                      )
                    }
                  >
                    {t("image")}
                  </button>
                </div>

                <div className="tool-actions">
                  <button
                    type="button"
                    className="tool-btn"
                    onClick={
                      undo
                    }
                    disabled={
                      mapType !==
                      "free"
                    }
                  >
                    ↶{" "}
                    {t("undo")}
                  </button>

                  <button
                    type="button"
                    className="tool-btn"
                    onClick={
                      redo
                    }
                    disabled={
                      mapType !==
                      "free"
                    }
                  >
                    ↷{" "}
                    {t("redo")}
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
                        onChange={
                          handleImageChange
                        }
                        hidden
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
                          />

                          {" "}
                          {t(
                            "showImage"
                          )}
                        </label>

                        <button
                          type="button"
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

            {mapType ===
              "free" && (
              <section className="sidebar-section palette-section">
                <div className="section-heading">
                  {t("palette")}
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
                      title={`Выбран: ${drawColor}`}
                    />
                  </div>

                  <div className="color-palette-section">
                    <div className="color-list">
                      {BASIC_COLORS.map(
                        (
                          color
                        ) => (
                          <button
                            key={
                              color
                            }
                            type="button"
                            className={
                              drawColor ===
                              color
                                ? "color-item selected"
                                : color ===
                                    "#ffffff"
                                  ? "color-item white"
                                  : "color-item"
                            }
                            title={
                              color
                            }
                            onClick={() =>
                              selectDrawColor(
                                color
                              )
                            }
                            style={{
                              "--color":
                                color,
                            }}
                          >
                            <span className="color-dot" />
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  {customColors.length >
                    0 && (
                    <div className="color-palette-section custom-colors-section">
                      <div className="color-palette-label">
                        {t(
                          "myColors"
                        )}
                      </div>

                      <div className="color-list">
                        {customColors.map(
                          (
                            color
                          ) => (
                            <div
                              key={
                                color
                              }
                              className="custom-color-wrapper"
                              onContextMenu={(
                                event
                              ) =>
                                handleCustomColorContextMenu(
                                  event,
                                  color
                                )
                              }
                            >
                              <button
                                type="button"
                                className={
                                  drawColor ===
                                  color
                                    ? "color-item selected"
                                    : color ===
                                        "#ffffff"
                                      ? "color-item white"
                                      : "color-item"
                                }
                                title={
                                  color
                                }
                                onClick={() =>
                                  selectDrawColor(
                                    color
                                  )
                                }
                                style={{
                                  "--color":
                                    color,
                                }}
                              >
                                <span className="color-dot" />
                              </button>

                              <button
                                type="button"
                                className="delete-color-btn"
                                aria-label={t(
                                  "delete"
                                )}
                                title={t(
                                  "delete"
                                )}
                                onClick={(
                                  event
                                ) => {
                                  event.preventDefault();
                                  event.stopPropagation();

                                  deleteCustomColor(
                                    color
                                  );
                                }}
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
                    <div className="color-picker-wrap">
                      <input
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
                        title={t(
                          "brushColor"
                        )}
                      />

                      <span className="color-picker-value">
                        {newColor.toUpperCase()}
                      </span>
                    </div>

                    <button
                      type="button"
                      className="add-color-btn"
                      onClick={
                        addCustomColor
                      }
                    >
                      <span>
                        +
                      </span>{" "}
                      {t(
                        "addColor"
                      )}
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
                    t("newMap")}
                </h1>
              </div>

              <span className="painted-count">
                {completed.length}{" "}
                /{" "}
                {actualTotal}{" "}
                {t("cells")}
              </span>
            </div>

            <div className="canvas-card">
              <div
                className="grid-container"
                style={{
                  aspectRatio: `${cols} / ${rows}`,
                }}
                onContextMenu={(e) =>
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
                  onContextMenu={(e) =>
                    e.preventDefault()
                  }
                  onDragStart={(e) =>
                    e.preventDefault()
                  }
                />
              </div>
            </div>

            <div className="drawing-hint">
              {t("drawHint")}

              {mapType ===
                "free" &&
                " · Ctrl+Z / Ctrl+Y"}
            </div>
          </section>

          <aside className="right-sidebar">
            <section className="sidebar-section preview-panel">
              <div className="section-heading">
                {t("preview")}
              </div>

              <div
                className="mini-preview"
                style={{
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  aspectRatio: `${cols} / ${rows}`,
                }}
              >
                {Array.from(
                  {
                    length:
                      actualTotal,
                  },
                  (_, index) => {
                    const isActive =
                      completed.includes(
                        index
                      );

                    const color =
                      mapType ===
                      "free"
                        ? colors[
                            index
                          ] ||
                          BASIC_COLORS[0]
                        : colors[
                            index
                          ] ||
                          "#e5e5e5";

                    return (
                      <span
                        key={
                          index
                        }
                        style={{
                          backgroundColor:
                            isActive
                              ? color
                              : mapType ===
                                  "image" &&
                                showImage &&
                                image
                                ? color
                                : "#eeeeea",

                          opacity:
                            !isActive &&
                            mapType ===
                              "image" &&
                            showImage &&
                            image
                              ? 0.35
                              : 1,
                        }}
                      />
                    );
                  }
                )}
              </div>

              <div className="preview-progress">
                <strong>
                  {progress}%
                </strong>

                <span>
                  {t("filled")}
                </span>
              </div>

              <div className="preview-bar">
                <i
                  style={{
                    width: `${progress}%`,
                  }}
                />
              </div>

              <div className="preview-stat">
                <span>
                  {t("painted")}{" "}
                  {t("cells")}
                </span>

                <strong>
                  {completed.length}
                </strong>
              </div>

              <div className="preview-stat">
                <span>
                  {t("total")}{" "}
                  {t("cells")}
                </span>

                <strong>
                  {actualTotal}
                </strong>
              </div>

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
          onMouseDown={
            closeCreateModal
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
                type="button"
                className="modal-close"
                onClick={
                  closeCreateModal
                }
              >
                ×
              </button>
            </div>

            <div className="modal-field">
              <label htmlFor="newMapName">
                {t("name")}
              </label>

              <input
                id="newMapName"
                type="text"
                placeholder={t(
                  "name"
                )}
                value={
                  newMapName
                }
                onChange={(e) =>
                  setNewMapName(
                    e.target.value
                  )
                }
              />
            </div>

            <div className="modal-field">
              <label>
                {t("mapType")}
              </label>

              <div className="modal-map-types">
                <button
                  type="button"
                  className={
                    newMapType ===
                    "image"
                      ? "map-type-btn active"
                      : "map-type-btn"
                  }
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
                  className={
                    newMapType ===
                    "free"
                      ? "map-type-btn active"
                      : "map-type-btn"
                  }
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
                  className={
                    newMapGridMode ===
                    "auto"
                      ? "map-type-btn active"
                      : "map-type-btn"
                  }
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
                  className={
                    newMapGridMode ===
                    "manual"
                      ? "map-type-btn active"
                      : "map-type-btn"
                  }
                  onClick={() =>
                    setNewMapGridMode(
                      "manual"
                    )
                  }
                >
                  {t("manual")}
                </button>
              </div>
            </div>

            {newMapGridMode ===
            "auto" ? (
              <div className="modal-field">
                <label htmlFor="newMapCells">
                  {t("cells")}
                </label>

                <input
                  id="newMapCells"
                  type="number"
                  min="1"
                  value={
                    newMapCells
                  }
                  onChange={(e) =>
                    setNewMapCells(
                      e.target.value
                    )
                  }
                />
              </div>
            ) : (
              <div className="manual-grid-controls">
                <div className="modal-field">
                  <label htmlFor="newMapRows">
                    {t("rows")}
                  </label>

                  <input
                    id="newMapRows"
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
                  <label htmlFor="newMapCols">
                    {t("columns")}
                  </label>

                  <input
                    id="newMapCols"
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
              type="button"
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
          onMouseDown={
            closeRenameModal
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
                type="button"
                className="modal-close"
                onClick={
                  closeRenameModal
                }
              >
                ×
              </button>
            </div>

            <div className="modal-field">
              <label htmlFor="renameMap">
                {t("newName")}
              </label>

              <input
                id="renameMap"
                type="text"
                value={
                  renameValue
                }
                onChange={(e) =>
                  setRenameValue(
                    e.target
                      .value
                  )
                }
                autoFocus
              />
            </div>

            <button
              type="button"
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
            onMouseDown={
              closeDeleteModal
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
                  type="button"
                  className="modal-close"
                  onClick={
                    closeDeleteModal
                  }
                >
                  ×
                </button>
              </div>

              <p className="delete-modal-text">
                {t(
                  "deleteMap"
                )}{" "}
                «
                {
                  mapToDelete.name
                }
                »
              </p>

              <div className="delete-modal-actions">
                <button
                  type="button"
                  className="cancel-delete-btn"
                  onClick={
                    closeDeleteModal
                  }
                >
                  {t("cancel")}
                </button>

                <button
                  type="button"
                  className="confirm-delete-btn"
                  onClick={
                    confirmDeleteMap
                  }
                >
                  {t("delete")}
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}

export default App;