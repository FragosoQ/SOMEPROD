const config = {
    rotationDelay: 0,
    scaleFactor: 1,
    degPerSec: 20,
    angles: { x: 9, y: -39, z: 0 },
    colors: {
        water: '#111',
        land: '#424447',
        portugal: '#4b8cf2',
        destination: 'white',
        hover: '#eee',
        panel: '#007bff',
        originRipple: '#4b8cf2',
        destinationRipple: 'cyan',
        destinationPointColor: 'cyan'
    },
    ripple: {
        maxRadius: 20,
        duration: 2000,
        interval: 800
    },
};

const state = {
    currentCountry: null,
    lastTime: d3.now(),
    degPerMs: config.degPerSec / 1000,
    isDragging: false,
    startX: 0,
    startY: 0,
    portugal: null,
    destination: null,
    destinationName: null,
    dashOffset: 0,
    isAutoRotating: false, // Início Parado
    activeRipples: [],
};

const elements = {
    countryLabel: d3.select('#countryLabel'),
    canvas: d3.select('#globe'),
    context: d3.select('#globe').node().getContext('2d'),
    logo2: d3.select('#logo2'),
    destinationCard: d3.select('#destination-card'),
    // Referência ao painel de informação
    infoPanel: d3.select('#panel-bottom') 
};

const projection = d3.geoOrthographic().precision(0.1);
const path = d3.geoPath(projection).context(elements.context);
const geoLine = d3.geoPath(projection).context(elements.context);
let autorotate, land, countries, countryList, arcFeature;
let ptRippleInterval, destRippleInterval;
let renderLoop;

// ID da planilha partilhada
const SPREADSHEET_ID = '1quphFwoVMjelWgxaF9jQi2qrAlHBir4Kc0LRUZRtaoY';


// --- Funções Auxiliares do Globo ---

const setAngles = () => {
    const rotation = projection.rotate();
    rotation[0] = config.angles.x; rotation[1] = config.angles.y; rotation[2] = config.angles.z;
    projection.rotate(rotation);
};

const scale = () => {
    const width = elements.canvas.node().offsetWidth;
    const height = elements.canvas.node().offsetHeight;
    const finalWidth = width > 0 ? width : (document.documentElement.clientHeight * 0.6);
    const finalHeight = height > 0 ? height : (document.documentElement.clientHeight * 0.6);
    elements.canvas.attr('width', finalWidth).attr('height', finalHeight);
    projection
        .scale(Math.min(finalWidth, finalHeight) / 2)
        .translate([finalWidth / 2, finalHeight / 2]);
        
    // Chama a renderização dos gráficos no resize para garantir que se adaptam
    if (typeof updateAllCharts === 'function') {
        updateAllCharts();
    }
    render();
};

const startRotation = (delay) => {
    if (autorotate) {
        autorotate.restart(rotate, delay || 0);
    }
    state.isAutoRotating = true; // Define o estado
};

const dragstarted = (event) => {
    state.isDragging = true;
    state.startX = event.x;
    state.startY = event.y;
    state.draggedDelta = 0;

    // Pausa a auto-rotação SÓ se estiver a rodar (permite interação manual)
    if (autorotate && state.isAutoRotating) {
        autorotate.stop();
    }
};

const dragged = (event) => {
    if (!state.isDragging) { return } ;
    const sensitivity = 0.25;
    const dx = (event.x - state.startX) * sensitivity;
    const dy = (event.y - state.startY) * sensitivity;

    state.draggedDelta += Math.abs(dx) + Math.abs(dy);

    state.startX = event.x; state.startY = event.y;
    const rotation = projection.rotate();
    rotation[0] += dx; rotation[1] -= dy;
    projection.rotate(rotation);
};

const dragended = () => {
    state.isDragging = false;

    // Retoma a auto-rotação, SE ESTAVA ATIVA ANTES DO DRAG
    if (state.isAutoRotating) {
        startRotation(config.rotationDelay);
    }
};

const fill = (obj, color) => {
    elements.context.beginPath(); path(obj);
    elements.context.fillStyle = color; elements.context.fill();
};

const rotate = (elapsed) => {
    const now = d3.now();
    const diff = now - state.lastTime;

    if (diff < elapsed) {
        const rotation = projection.rotate(); rotation[0] += diff * state.degPerMs;
        projection.rotate(rotation);
    }
    state.lastTime = now;
};

/**
 * Função para iniciar a rotação através do clique no CANVAS.
 */
const startAutoRotationOnClick = () => {
    if (!state.isAutoRotating) {
        startRotation(config.rotationDelay);
        // Remove o listener de clique no canvas após o primeiro clique
        elements.canvas.on('click', null); 
        console.log("Globo iniciado após clique no canvas.");
    }
};


// --- Funções Principais de Dados e Inicialização do Globo ---

const fetchDestination = async () => {
    const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=DESTINO`;

    try {
        const response = await d3.text(SHEET_URL);
        const lines = response.split('\n');

        if (lines.length > 1) {
            const rawData = lines[1].replace(/"/g, '').trim();

            if (rawData.startsWith('Destino')) {
                return rawData.replace(/^Destino/, '').trim().toUpperCase();
            }
            return rawData.trim().toUpperCase();
        }
        return 'BRAZIL';
    } catch (error) {
        console.error('Erro ao buscar destino da planilha:', error);
        return 'BRAZIL';
    }
};

const loadData = async (cb) => {
    const world = await d3.json('https://unpkg.com/world-atlas@2.0.2/countries-110m.json');
    const countryNames = await d3.tsv('https://gist.githubusercontent.com/mbostock/4090846/raw/07e73f3c2d21558489604a0bc434b3a5cf41a867/world-country-names.tsv');
    countryNames[110].name = "Palestine";

    const destinationName = await fetchDestination();

    cb(world, countryNames, destinationName);
};


const addRippleEffect = (center, colorKey) => {
    const now = d3.now();
    state.activeRipples.push({
        startTime: now,
        center: center,
        colorKey: colorKey
    });
};

const render = () => {
    const { context } = elements;
    const width = document.documentElement.clientWidth;
    const height = document.documentElement.clientHeight;
    context.clearRect(0, 0, width, height);

    fill({ type: 'Sphere' }, config.colors.water);
    fill(land, config.colors.land);

    if (state.portugal) { fill(state.portugal, config.colors.portugal); }
    if (state.destination) { fill(state.destination, config.colors.destination); }

    // Desenha a Linha de Ligação (Sempre visível)
    if (arcFeature) {
        elements.context.beginPath(); geoLine(arcFeature);
        elements.context.lineWidth = 1.5; elements.context.strokeStyle = 'cyan';
        const dashLength = 4; const dashGap = 6;

        const now = d3.now();
        const diff = now - state.lastTime;
        state.dashOffset += diff * 0.02;

        elements.context.setLineDash([dashLength, dashGap]);
        elements.context.lineDashOffset = -state.dashOffset;
        elements.context.stroke(); elements.context.setLineDash([]);

        const destCenter = arcFeature.coordinates[1];
        const finalPixelPosition = projection(destCenter);
        const geocoords = projection.invert(finalPixelPosition);

        if (geocoords && d3.geoDistance(geocoords, projection.center()) < Math.PI / 2) {
            elements.context.beginPath();
            elements.context.arc(finalPixelPosition[0], finalPixelPosition[1], 4, 0, 2 * Math.PI);

            elements.context.fillStyle = config.colors.destinationPointColor;

            elements.context.fill();
        }
    }

    const now = d3.now();
    // Processamento do Ripple (Sempre Ativo)
    state.activeRipples = state.activeRipples.filter(ripple => {
        const elapsedTime = now - ripple.startTime;
        if (elapsedTime > config.ripple.duration) {
            return false;
        }

        const progress = elapsedTime / config.ripple.duration;
        const radius = config.ripple.maxRadius * progress;
        const opacity = 1 - progress;

        const [x, y] = projection(ripple.center);
        const geocoords = projection.invert([x, y]);

        if (geocoords && d3.geoDistance(geocoords, projection.center()) < Math.PI / 2) {
            context.beginPath();
            context.arc(x, y, radius, 0, 2 * Math.PI);

            const color = config.colors[ripple.colorKey];
            const rgb = d3.color(color);

            context.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${opacity})`;
            context.lineWidth = 2;
            context.stroke();
        }
        return true;
    });


    if (state.currentCountry && state.currentCountry !== state.portugal && state.currentCountry !== state.destination) {
        elements.countryLabel.style('color', 'white')
        fill(state.currentCountry, config.colors.hover);
    }

    state.lastTime = now;
};

// ===============================================
// FUNÇÕES DE GRÁFICOS E DADOS DOS PAINÉIS
// ===============================================

/**
 * Busca o valor de percentagem da célula A2 de uma folha específica.
 */
const fetchPercentage = async (sheetName) => {
    const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${sheetName}&range=A2`;

    try {
        const response = await d3.text(SHEET_URL);
        
        let rawValue = response.split('\n')[1]?.trim(); 

        if (!rawValue) {
             rawValue = response.split('\n')[0]?.trim(); 
        }

        if (!rawValue) {
             console.warn(`Dados vazios ou formato inesperado para ${sheetName}.`);
             return 0;
        }

        rawValue = rawValue.replace(/"/g, ''); 
        rawValue = rawValue.replace(',', '.'); 
        const numericMatch = rawValue.match(/^-?\d+(\.\d+)?/); 
        
        if (numericMatch) {
            const parsedValue = parseFloat(numericMatch[0]);
            
            if (!isNaN(parsedValue)) {
                return Math.min(100, Math.max(0, parsedValue));
            }
        }
        
        console.warn(`Valor não numérico encontrado em ${sheetName}: "${rawValue}". Usando 0% como fallback.`);
        return 0;

    } catch (error) {
        console.error(`Erro ao buscar dados da folha ${sheetName}:`, error);
        return 0; 
    }
};

/**
 * Busca o valor de progresso EVO da célula A2 do separador EVO.
 */
const fetchOverallProgress = async () => {
    return await fetchPercentage('EVO'); // Reutiliza a função genérica para o separador EVO
};


/**
 * Desenha um Donut Chart (Gráfico de Anel) dentro de um container D3.
 */
const drawDonutChart = (containerId, percentage, fillColor) => {
    const container = d3.select(containerId);
    container.html('');

    const containerNode = container.node();
    const rect = containerNode.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    const size = Math.min(width, height, 150) - 10;
    
    if (size <= 0) {
        const fallbackSize = 100;
        d3.select(containerId)
            .style('min-width', `${fallbackSize}px`)
            .style('min-height', `${fallbackSize}px`);
        return; 
    }

    const radius = size / 2;
    const innerRadius = radius * 0.7; // Tamanho do furo para o anel

    const arc = d3.arc()
        .innerRadius(innerRadius)
        .outerRadius(radius);

    const pie = d3.pie()
        .sort(null)
        .value(d => d.value)
        .startAngle(-Math.PI * 0.5) 
        .endAngle(Math.PI * 1.5); 

    const data = [
        { value: percentage, name: 'Preenchido' },
        { value: 100 - percentage, name: 'Vazio' }
    ];

    const svg = container.append('svg')
        .attr('width', size)
        .attr('height', size)
        .attr('viewBox', `0 0 ${size} ${size}`)
        .append('g')
        .attr('transform', `translate(${size / 2}, ${size / 2})`);

    const arcs = svg.selectAll('.arc')
        .data(pie(data))
        .enter()
        .append('g')
        .attr('class', 'arc');

    arcs.append('path')
        .attr('d', arc)
        .attr('fill', (d, i) => i === 0 ? fillColor : 'rgba(255, 255, 255, 0.2)')
        .attr('stroke', 'none');

    svg.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.3em') 
        .style('font-size', '1.5rem')
        .style('font-weight', 'bold')
        .style('fill', 'white')
        .text(`${percentage.toFixed(0)}%`);
};

/**
 * Desenha a barra de progresso horizontal para o valor EVO.
 */
const drawProgressBar = (percentage) => {
    const container = d3.select('#progress-bar-container');
    container.html(''); // Limpa conteúdo anterior

    const width = container.node()?.offsetWidth || 400;
    const height = 20;
    const padding = 5;

    if (width <= 0) return;

    const svg = container.append('svg')
        .attr('width', width)
        .attr('height', height + padding * 2);

    // Fundo da barra (Barra completa 100%)
    svg.append('rect')
        .attr('x', padding)
        .attr('y', padding)
        .attr('width', width - (padding * 2))
        .attr('height', height)
        .attr('rx', 10) 
        .attr('ry', 10)
        .attr('fill', 'rgba(255, 255, 255, 0.1)'); 

    // Preenchimento da barra (o progresso)
    svg.append('rect')
        .attr('x', padding)
        .attr('y', padding)
        .attr('width', (width - (padding * 2)) * (percentage / 100))
        .attr('height', height)
        .attr('rx', 10)
        .attr('ry', 10)
        .attr('fill', config.colors.portugal) 
        .style('transition', 'width 1s ease-out');

    // Texto da percentagem
    svg.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2 + padding)
        .attr('dy', '0.3em')
        .attr('text-anchor', 'middle')
        .style('font-size', '12px')
        .style('font-weight', 'bold')
        .style('fill', 'white')
        /*.text(`EVO Progress: ${percentage.toFixed(1)}%`);*/
};


/**
 * Função para configurar o Painel de Informação, incluindo a imagem no canto inferior direito.
 */
const setupInfoPanel = () => {
    if (elements.infoPanel.node()) {
        const imageUrl = 'https://static.wixstatic.com/media/a6967f_034c4bb41e814fc7b03969408024e9a1~mv2.png';
        
        // Remove qualquer imagem ou conteúdo anterior injetado.
        elements.infoPanel.select('.info-image-container').remove();

        // Adiciona um container DIV para a imagem, responsável pelo posicionamento fixo.
        const imageContainer = elements.infoPanel
            .append('div')
            .attr('class', 'info-image-container')
            .style('position', 'absolute')
            // AJUSTADO: Distância fixa de 5px do fundo
            .style('bottom', '10px')  
            // AJUSTADO: Distância fixa de 5px do lado direito
            .style('right', '15px') 
            .style('width', '40%') 
            .style('height', '70%')
            // REMOVIDO: O padding e background foram removidos para que a imagem encoste 
            // diretamente nos 5px de margem, conforme solicitado.
            .style('display', 'flex')
            .style('justify-content', 'flex-end')
            .style('align-items', 'flex-end');

        // Imagem dentro do container
        imageContainer.append('img')
            .attr('src', imageUrl)
            .attr('alt', 'Image Multiwasher')
            .style('max-height', '100%') 
            .style('width', 'auto')
            .style('object-fit', 'contain');
    }
}


/**
 * Função para inicializar e atualizar todos os gráficos.
 */
const updateAllCharts = async () => {
    // 1. Atualiza os Donut Charts
    const panels = [
        { id: '#chart-cuba', sheet: 'CUBA', color: '#4b8cf2' },
        { id: '#chart-interiores', sheet: 'INTERIORES', color: '#00cc99' },
        { id: '#chart-testes', sheet: 'TESTES', color: '#ffcc00' },
        { id: '#chart-exteriores', sheet: 'EXTERIORES', color: '#ff6666' }
    ];

    for (const panel of panels) {
        const percentage = await fetchPercentage(panel.sheet);
        drawDonutChart(panel.id, percentage, panel.color);
    }
    
    // 2. NOVO: Atualiza a Barra de Progresso EVO
    const evoPercentage = await fetchOverallProgress();
    drawProgressBar(evoPercentage);
};

// ===============================================
// INICIALIZAÇÃO
// ===============================================

export const init = () => {
    
    // Liga o drag no canvas para permitir rotação manual
    elements.canvas.call(
        d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended)
    )
    .on('mousemove', (event) => {
        const getCountry = (e) => {
            const pos = projection.invert(d3.pointer(e));
            return countries.features.find((f) => f.geometry.coordinates.find((c1) => d3.polygonContains(c1, pos) || c1.some((c2) => d3.polygonContains(c2, pos))));
        };
        const country = getCountry(event);
        if (!country) {
            if (state.currentCountry) { state.currentCountry = null; elements.countryLabel.text(''); render(); }
            return;
        }
        if (country === state.currentCountry) { return; }
        state.currentCountry = country;
        render();
        // CORRIGIDO: Usa country.id para encontrar o nome na countryList
        const name = countryList.find((c) => parseInt(c.id) === parseInt(country.id))?.name || '';
        elements.countryLabel.text(name);

    }).on('touchmove', (event) => {
        const getCountry = (e) => {
            const pos = projection.invert(d3.pointer(e));
            return countries.features.find((f) => f.geometry.coordinates.find((c1) => d3.polygonContains(c1, pos) || c1.some((c2) => d3.polygonContains(c2, pos))));
        };
        const country = getCountry(event);
        if (!country) {
            if (state.currentCountry) { state.currentCountry = null; elements.countryLabel.text(''); render(); }
            return;
        }
        if (country === state.currentCountry) { return; }
        state.currentCountry = country;
        render();
        // CORRIGIDO: Usa country.id para encontrar o nome na countryList
        const name = countryList.find((c) => parseInt(c.id) === parseInt(c.id))?.name || '';
        elements.countryLabel.text(name);
    })
    // Adiciona o listener de clique no canvas para iniciar a rotação
    .on('click', startAutoRotationOnClick); 

    if (ptRippleInterval) clearInterval(ptRippleInterval);
    if (destRippleInterval) clearInterval(destRippleInterval);
    if (renderLoop) renderLoop.stop();

    autorotate = null;

    loadData(async (world, cList, destinationName) => {
        land = topojson.feature(world, world.objects.land);
        countries = topojson.feature(world, world.objects.countries);
        countryList = cList;

        state.destinationName = destinationName;

        state.portugal = countries.features.find(c => countryList.find(cn => parseInt(cn.id) === parseInt(c.id))?.name === 'Portugal');

        state.destination = countries.features.find(c => countryList.find(cn => parseInt(cn.id) === parseInt(c.id))?.name.toUpperCase() === destinationName);

        if (!state.destination) {
            console.warn(`País destino "${destinationName}" não encontrado. Usando Brasil como fallback.`);
            state.destination = countries.features.find(c => countryList.find(cn => parseInt(cn.id) === parseInt(c.id))?.name === 'Brazil');
            state.destinationName = 'Brazil (Fallback)';
        }

        if (state.portugal && state.destination) {
            const ptCenter = d3.geoCentroid(state.portugal);
            
            const destCenter = d3.geoCentroid(state.destination); 
            
            arcFeature = { type: 'LineString', coordinates: [ptCenter, destCenter] };
            
            // 1. CALCULA O PONTO MÉDIO NO ARCO GEODÉSICO
            const interpolate = d3.geoInterpolate(ptCenter, destCenter);
            const midPoint = interpolate(0.5); // 0.5 é o ponto central
            
            // 2. DEFINE A ROTAÇÃO INICIAL PARA O PONTO MÉDIO (Novo Foco)
            projection.rotate([-midPoint[0], -midPoint[1]]);

            // INICIA O INTERVALO DE RIPPLE PARA PORTUGAL (SEMPRE ATIVO)
            ptRippleInterval = setInterval(() => {
                const projectedPtCenter = projection(ptCenter);
                if (projectedPtCenter && d3.geoDistance(ptCenter, projection.center()) < Math.PI / 2) {
                    addRippleEffect(ptCenter, 'originRipple');
                }
            }, config.ripple.interval);
            
            // INICIA O INTERVALO DE RIPPLE PARA O DESTINO (SEMPRE ATIVO)
            destRippleInterval = setInterval(() => {
                const projectedDestCenter = projection(destCenter);
                if (projectedDestCenter && d3.geoDistance(destCenter, projection.center()) < Math.PI / 2) {
                    addRippleEffect(destCenter, 'destinationRipple');
                }
            }, config.ripple.interval);
        }

        // Configura o Painel de Informação (imagem no canto inferior direito a 5px)
        setupInfoPanel();
        
        // Chama a função de atualização de gráficos (incluindo a nova barra EVO)
        updateAllCharts();

        window.addEventListener('resize', scale);
        scale();

        autorotate = d3.timer(rotate);
        autorotate.stop(); // Garante que o globo começa parado
        
        renderLoop = d3.timer(render);
        
        // --- INJETAR NOME DO PAÍS NO CARD DE DESTINO FLUTUANTE ---
        if (elements.destinationCard.node()) {
            // Atualiza o conteúdo do div dentro do card
            elements.destinationCard.select('.destination-name-content').text(state.destinationName);
        }
    });
};


init();
