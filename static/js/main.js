AOS.init({ once: true });

document.addEventListener('DOMContentLoaded', (event) => {
    const socket = io.connect(location.protocol + '//' + document.domain + ':' + location.port);

    // --- 元素获取 ---
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const stopSchedulerBtn = document.getElementById('stop-scheduler-btn');
    const deleteConfigBtn = document.getElementById('delete-config-btn');
    const saveConfigBtn = document.getElementById('save-config-btn');
    const configSelect = document.getElementById('config-select');
    const runningStatus = document.getElementById('running-status');
    const configInputs = {
        name: document.getElementById('config-name'),
        urls: document.getElementById('urls'),
        threads: document.getElementById('threads'),
        limit_speed: document.getElementById('limit-speed'),
        traffic_limit: document.getElementById('traffic-limit'),
        duration: document.getElementById('duration'),
        count: document.getElementById('count'),
        cron_expr: document.getElementById('cron-expr'),
        interval: document.getElementById('interval'),
        url_strategy: document.getElementById('url-strategy'),
        auto_remove_failed_url: document.getElementById('auto-remove-failed-url'),
        auto_start: document.getElementById('auto-start'),
        user_agent: document.getElementById('user-agent'),
        request_headers: document.getElementById('request-headers'),
        url_switch_interval: document.getElementById('url-switch-interval'),
        thread_start_delay: document.getElementById('thread-start-delay')
    };
    const jobDetailsEl = document.getElementById('job-details');
    const cronPreviewEl = document.getElementById('cron-preview');
    const logSwitch = document.getElementById('log-switch');
    const logContainer = document.getElementById('log-container');
    const clearLogBtn = document.getElementById('clear-log-btn');
    const editorConfigSelect = document.getElementById('config-editor-select');
    const configEditorEl = document.getElementById('config-editor');
    const resetConfigBtn = document.getElementById('reset-config-btn');
    const threadStatusList = document.getElementById('thread-status-list');
    const urlUsageList = document.getElementById('url-usage-list');
    const notificationArea = document.getElementById('notification-area');
    const activeThreadCountEl = document.getElementById('active-thread-count');
    const idleThreadCountEl = document.getElementById('idle-thread-count');
    const totalThreadCountEl = document.getElementById('total-thread-count');
    const erroredThreadCountEl = document.getElementById('errored-thread-count');
    const currentConfigEl = document.getElementById('current-config');
    const runtimePlanListEl = document.getElementById('runtime-plan-list');
    const planDetailModalEl = document.getElementById('plan-detail-modal');
    const planDetailNameEl = document.getElementById('plan-detail-name');
    const planDetailNextRunEl = document.getElementById('plan-detail-next-run');
    const planDetailTotalEl = document.getElementById('plan-detail-total');
    const planDetailHistoryBody = document.getElementById('plan-detail-history-body');
    const planDetailModal = planDetailModalEl ? bootstrap.Modal.getOrCreateInstance(planDetailModalEl) : null;

    let selectedConfigName = null;
    let selectedConfigDetail = null;
    let editorActiveConfig = null;
    let pendingConfigTarget = null;
    let pendingConfigName = null;

    // --- Chart.js 初始化 ---
    const speedChartCtx = document.getElementById('speed-chart').getContext('2d');
    const speedChart = new Chart(speedChartCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: '速度 (MB/s)',
                data: [],
                borderColor: 'rgba(255, 105, 180, 0.8)',
                backgroundColor: 'rgba(255, 105, 180, 0.2)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { display: false },
                y: {
                    beginAtZero: true,
                    ticks: { color: '#FF69B4' }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });

    const urlPieChartCanvas = document.getElementById('url-pie-chart');
    const urlPieChart = urlPieChartCanvas ? new Chart(urlPieChartCanvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['无数据'],
            datasets: [{
                data: [1],
                backgroundColor: ['rgba(255, 228, 240, 0.9)'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '58%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        boxWidth: 14,
                        boxHeight: 14,
                        padding: 12,
                        color: '#666'
                    }
                },
                tooltip: {
                    callbacks: {
                        label(context) {
                            const label = context.label || '';
                            const value = context.parsed;
                            return `${label}: ${value} 次`;
                        }
                    }
                }
            }
        }
    }) : null;

    const threadUsageChartCanvas = document.getElementById('thread-usage-chart');
    const threadUsageChart = threadUsageChartCanvas ? new Chart(threadUsageChartCanvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['活跃', '空闲', '失效'],
            datasets: [{
                data: [0, 0, 0],
                backgroundColor: [
                    'rgba(255, 105, 180, 0.85)',
                    'rgba(255, 182, 193, 0.85)',
                    'rgba(220, 53, 69, 0.75)'
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        boxWidth: 12,
                        boxHeight: 12,
                        padding: 10,
                        color: '#666'
                    }
                },
                tooltip: {
                    callbacks: {
                        label(context) {
                            const label = context.label || '';
                            const value = context.parsed;
                            return `${label}: ${value} 条线程`;
                        }
                    }
                }
            }
        }
    }) : null;


    function addDataToChart(label, data) {
        speedChart.data.labels.push(label);
        speedChart.data.datasets.forEach((dataset) => {
            dataset.data.push(data);
        });
        if (speedChart.data.labels.length > 30) {
            speedChart.data.labels.shift();
            speedChart.data.datasets[0].data.shift();
        }
        speedChart.update('none'); // 'none' for no animation
    }

    function updateUrlPieChart(stats = []) {
        if (!urlPieChart) return;

        if (!Array.isArray(stats) || stats.length === 0) {
            urlPieChart.data.labels = ['无数据'];
            urlPieChart.data.datasets[0].data = [1];
            urlPieChart.data.datasets[0].backgroundColor = ['rgba(255, 228, 240, 0.9)'];
            urlPieChart.update('none');
            return;
        }

        const palette = [
            'rgba(255, 105, 180, 0.85)',
            'rgba(255, 182, 193, 0.85)',
            'rgba(255, 160, 176, 0.85)',
            'rgba(255, 215, 230, 0.85)',
            'rgba(255, 240, 245, 0.9)',
            'rgba(255, 200, 210, 0.85)'
        ];

        const labels = [];
        const values = [];
        const colors = [];

        stats.forEach((item, index) => {
            const label = item.url || `链接 ${index + 1}`;
            const value = Number(item.count) || 0;
            labels.push(label);
            values.push(value);
            colors.push(palette[index % palette.length]);
        });

        urlPieChart.data.labels = labels;
        urlPieChart.data.datasets[0].data = values;
        urlPieChart.data.datasets[0].backgroundColor = colors;
        urlPieChart.update('none');
    }

    function updateThreadUsageChart(active = 0, idle = 0, errored = 0) {
        if (!threadUsageChart) return;
        threadUsageChart.data.datasets[0].data = [active, idle, errored];
        threadUsageChart.update('none');
    }

    function resetConfigForm(keepSelection = false) {
        Object.keys(configInputs).forEach((key) => {
            const element = configInputs[key];
            if (!element) return;
            if (element.type === 'checkbox') {
                element.checked = false;
            } else if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
                element.value = '';
            } else {
                element.value = '';
            }
        });
        if (!keepSelection && editorConfigSelect) {
            editorConfigSelect.value = '';
        }
        if (cronPreviewEl) {
            cronPreviewEl.innerHTML = '';
        }
        editorActiveConfig = null;
        if (configInputs.cron_expr) {
            configInputs.cron_expr.dispatchEvent(new Event('input'));
        }
    }

    function populateEditorForm(name, config = {}) {
        if (configInputs.name) {
            configInputs.name.value = name || '';
        }
        if (configInputs.urls) {
            const urls = Array.isArray(config.urls) ? config.urls : [];
            configInputs.urls.value = urls.join('\n');
        }
        if (configInputs.threads) {
            configInputs.threads.value = config.threads ?? '';
        }
        if (configInputs.limit_speed) {
            configInputs.limit_speed.value = config.limit_speed ?? '';
        }
        if (configInputs.traffic_limit) {
            configInputs.traffic_limit.value = config.traffic_limit ?? '';
        }
        if (configInputs.duration) {
            configInputs.duration.value = config.duration ?? '';
        }
        if (configInputs.count) {
            configInputs.count.value = config.count ?? '';
        }
        if (configInputs.cron_expr) {
            configInputs.cron_expr.value = config.cron_expr ?? '';
        }
        if (configInputs.interval) {
            configInputs.interval.value = config.interval ?? '';
        }
        if (configInputs.url_strategy) {
            configInputs.url_strategy.value = config.url_strategy ?? '';
        }
        if (configInputs.auto_remove_failed_url) {
            configInputs.auto_remove_failed_url.checked = Boolean(config.auto_remove_failed_url);
        }
        if (configInputs.auto_start) {
            configInputs.auto_start.checked = Boolean(config.auto_start);
        }
        if (configInputs.user_agent) {
            configInputs.user_agent.value = config.user_agent ?? '';
        }
        if (configInputs.request_headers) {
            const headers = config.request_headers;
            if (Array.isArray(headers)) {
                configInputs.request_headers.value = headers.join('\n');
            } else if (headers && typeof headers === 'object') {
                configInputs.request_headers.value = Object.entries(headers)
                    .map(([name, value]) => `${name}: ${value}`)
                    .join('\n');
            } else {
                configInputs.request_headers.value = '';
            }
        }
        if (configInputs.url_switch_interval) {
            configInputs.url_switch_interval.value = config.url_switch_interval ?? '';
        }
        if (configInputs.thread_start_delay) {
            configInputs.thread_start_delay.value = config.thread_start_delay ?? '';
        }
        editorActiveConfig = name || null;
        if (cronPreviewEl) {
            cronPreviewEl.innerHTML = '';
        }
        if (configInputs.cron_expr) {
            configInputs.cron_expr.dispatchEvent(new Event('input'));
        }
    }

    function normalizeConfigPayload(config = {}, name = null) {
        const payload = {
            urls: Array.isArray(config.urls) ? [...config.urls] : [],
            url_strategy: config.url_strategy ?? null,
            threads: config.threads ?? null,
            limit_speed: config.limit_speed ?? null,
            traffic_limit: config.traffic_limit ?? null,
            duration: config.duration ?? null,
            count: config.count ?? null,
            cron_expr: config.cron_expr ?? null,
            interval: config.interval ?? null,
            config_name: name || config.config_name || null,
            auto_remove_failed_url: Boolean(config.auto_remove_failed_url),
            auto_start: Boolean(config.auto_start),
            user_agent: config.user_agent ?? null,
            request_headers: config.request_headers ?? null,
            url_switch_interval: config.url_switch_interval ?? null,
            thread_start_delay: config.thread_start_delay ?? null
        };

        payload.name = name || config.name || '';

        payload.urls = payload.urls
            .map((url) => {
                if (typeof url === 'string') {
                    return url.trim();
                }
                return url != null ? String(url).trim() : '';
            })
            .filter((url) => url !== '');

        const integerKeys = ['threads', 'traffic_limit', 'duration', 'count', 'interval'];
        integerKeys.forEach((key) => {
            if (payload[key] === null || payload[key] === undefined || payload[key] === '') {
                payload[key] = null;
                return;
            }
            const parsed = parseInt(payload[key], 10);
            payload[key] = Number.isFinite(parsed) ? parsed : null;
        });

        if (payload.limit_speed !== null && payload.limit_speed !== undefined && payload.limit_speed !== '') {
            const parsed = parseFloat(payload.limit_speed);
            payload.limit_speed = Number.isFinite(parsed) ? parsed : null;
        } else {
            payload.limit_speed = null;
        }

        if (!payload.url_strategy) {
            payload.url_strategy = null;
        }

        payload.user_agent = payload.user_agent ? String(payload.user_agent).trim() : null;

        if (payload.request_headers !== null && payload.request_headers !== undefined && payload.request_headers !== '') {
            if (Array.isArray(payload.request_headers)) {
                payload.request_headers = payload.request_headers
                    .map((line) => String(line).trim())
                    .filter((line) => line !== '');
            } else if (typeof payload.request_headers === 'string') {
                payload.request_headers = payload.request_headers
                    .split(/\r?\n/)
                    .map((line) => line.trim())
                    .filter((line) => line !== '');
            } else if (typeof payload.request_headers === 'object') {
                payload.request_headers = Object.fromEntries(
                    Object.entries(payload.request_headers)
                        .map(([k, v]) => [String(k).trim(), String(v).trim()])
                        .filter(([k, v]) => k !== '' && v !== '')
                );
            } else {
                payload.request_headers = null;
            }
        } else {
            payload.request_headers = null;
        }

        ['url_switch_interval', 'thread_start_delay'].forEach((key) => {
            if (payload[key] === null || payload[key] === undefined || payload[key] === '') {
                payload[key] = null;
                return;
            }
            const parsed = parseFloat(payload[key]);
            payload[key] = Number.isFinite(parsed) ? parsed : null;
        });

        return payload;
    }

    function requestConfigDetails(name, target) {
        if (!name) {
            if (target === 'runtime') {
                selectedConfigName = null;
                selectedConfigDetail = null;
                if (currentConfigEl) {
                    currentConfigEl.textContent = '未选择';
                    currentConfigEl.title = '未选择';
                }
            }
            if (target === 'editor') {
                resetConfigForm(true);
            }
            return;
        }
        if (target === 'runtime') {
            selectedConfigName = name;
            if (currentConfigEl) {
                const displayName = name || '未命名配置';
                currentConfigEl.textContent = displayName;
                currentConfigEl.title = displayName;
            }
        }
        if (target === 'editor') {
            editorActiveConfig = name;
        }
        pendingConfigTarget = target;
        pendingConfigName = name;
        socket.emit('get_config_details', { name, target });
    }

    function renderThreadStatus(threadMap = {}, totalThreads = 0) {
        if (!threadStatusList) return;

        const entries = Object.entries(threadMap || {});
        const expectedThreads = Number(totalThreads) || entries.length;

        threadStatusList.innerHTML = '';

        if (!expectedThreads) {
            threadStatusList.innerHTML = '<tr class="placeholder-row"><td colspan="3" class="text-center text-muted py-3">暂无线程数据。</td></tr>';
            if (totalThreadCountEl) totalThreadCountEl.textContent = '0';
            if (activeThreadCountEl) activeThreadCountEl.textContent = '0';
            if (idleThreadCountEl) idleThreadCountEl.textContent = '0';
            if (erroredThreadCountEl) erroredThreadCountEl.textContent = '0';
            updateThreadUsageChart(0, 0, 0);
            return;
        }

        const mapped = new Map(entries.map(([key, value]) => [Number(key), value]));
        let activeCount = 0;
        let idleCount = 0;
        let errorCount = 0;

        for (let i = 1; i <= expectedThreads; i += 1) {
            const rawValue = mapped.has(i) ? mapped.get(i) : null;
            let displayUrl = rawValue;
            if (displayUrl === null || displayUrl === undefined) {
                displayUrl = '';
            } else if (typeof displayUrl !== 'string') {
                displayUrl = String(displayUrl);
            }
            let status = 'idle';

            if (!displayUrl || displayUrl.trim() === '' || displayUrl.trim() === '等待分配...') {
                displayUrl = '等待分配...';
                status = 'idle';
            } else if (displayUrl.includes('已失效') || displayUrl.includes('无可用')) {
                status = 'error';
            } else {
                status = 'active';
            }

            const row = document.createElement('tr');

            const threadCell = document.createElement('td');
            threadCell.className = 'text-muted';
            threadCell.textContent = `线程 ${i}`;
            row.appendChild(threadCell);

            const urlCell = document.createElement('td');
            const urlSpan = document.createElement('span');
            urlSpan.className = 'thread-url text-truncate';
            const tooltipText = status === 'idle' ? '' : displayUrl;
            urlSpan.textContent = displayUrl || '等待分配...';
            if (tooltipText) {
                urlSpan.title = tooltipText;
            } else {
                urlSpan.removeAttribute('title');
            }
            if (status === 'error') {
                urlSpan.classList.add('text-danger');
            }
            urlCell.appendChild(urlSpan);
            row.appendChild(urlCell);

            const statusCell = document.createElement('td');
            statusCell.className = 'text-end';
            const badge = document.createElement('span');
            badge.className = 'badge thread-status-badge';

            if (status === 'active') {
                badge.classList.add('bg-success');
                badge.textContent = '运行中';
                activeCount += 1;
            } else if (status === 'error') {
                badge.classList.add('bg-danger');
                badge.textContent = displayUrl.includes('无可用') ? '耗尽' : '失效';
                errorCount += 1;
            } else {
                badge.classList.add('bg-secondary');
                badge.textContent = '待命';
                idleCount += 1;
            }

            statusCell.appendChild(badge);
            row.appendChild(statusCell);

            threadStatusList.appendChild(row);
        }

        if (totalThreadCountEl) totalThreadCountEl.textContent = expectedThreads.toString();
        if (activeThreadCountEl) activeThreadCountEl.textContent = activeCount.toString();
        if (idleThreadCountEl) idleThreadCountEl.textContent = idleCount.toString();
        if (erroredThreadCountEl) erroredThreadCountEl.textContent = errorCount.toString();

        updateThreadUsageChart(activeCount, idleCount, errorCount);
    }

    function renderUrlUsage(stats = []) {
        if (!urlUsageList) return;
        urlUsageList.innerHTML = '';

        if (!Array.isArray(stats) || stats.length === 0) {
            urlUsageList.innerHTML = '<p class="text-muted text-center mb-0">暂无下载数据。</p>';
            updateUrlPieChart([]);
            return;
        }

        stats.forEach((item) => {
            const percent = Number(item.percentage ?? 0);
            const safePercent = Number.isFinite(percent) ? percent : 0;
            const safeCount = Number.isFinite(Number(item.count)) ? Number(item.count) : 0;
            const safeUrl = item.url || '未知链接';

            const wrapper = document.createElement('div');
            wrapper.className = 'url-usage-entry mb-2';

            const header = document.createElement('div');
            header.className = 'd-flex align-items-center gap-2 small mb-1 overflow-hidden';
            const urlLabel = document.createElement('span');
            urlLabel.className = 'usage-url flex-grow-1 text-truncate';
            urlLabel.textContent = safeUrl;
            urlLabel.title = safeUrl;

            const statLabel = document.createElement('span');
            statLabel.className = 'fw-bold text-nowrap';
            statLabel.textContent = `${safePercent.toFixed(1)}% · ${safeCount} 次`;

            header.appendChild(urlLabel);
            header.appendChild(statLabel);

            const progressOuter = document.createElement('div');
            progressOuter.className = 'progress progress-sm';

            const progressBar = document.createElement('div');
            progressBar.className = 'progress-bar';
            const width = Math.max(0, Math.min(100, safePercent));
            progressBar.style.width = `${width}%`;
            progressBar.setAttribute('aria-valuenow', width.toString());
            progressBar.setAttribute('aria-valuemin', '0');
            progressBar.setAttribute('aria-valuemax', '100');

            progressOuter.appendChild(progressBar);
            wrapper.appendChild(header);
            wrapper.appendChild(progressOuter);

            urlUsageList.appendChild(wrapper);
        });

        updateUrlPieChart(stats);
    }

    function pushAlert(data = {}) {
        if (!notificationArea) return;
        // 区分失败、状态、提示等不同来源，避免所有通知都长成“下载失败”。
        const variant = typeof data.variant === 'string' && data.variant.trim()
            ? data.variant.trim()
            : 'danger';
        const titleText = typeof data.title === 'string' && data.title.trim()
            ? data.title.trim()
            : '下载失败：';
        const wrapper = document.createElement('div');
        wrapper.className = `alert alert-${variant} alert-dismissible fade show`;
        wrapper.setAttribute('role', 'alert');

        const title = document.createElement('strong');
        title.textContent = titleText;

        const message = document.createElement('span');
        const baseMessage = data.message || (data.url ? `链接 ${data.url} 已连续失败，已停止重试。` : '存在下载链接失效，已停止重试。');
        message.textContent = ` ${baseMessage}`;

        const detail = document.createElement('div');
        if (data.error) {
            detail.className = 'small text-muted mt-1';
            detail.textContent = `详情：${data.error}`;
        }

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'btn-close';
        closeBtn.setAttribute('data-bs-dismiss', 'alert');
        closeBtn.setAttribute('aria-label', '关闭');

        wrapper.appendChild(title);
        wrapper.appendChild(message);
        if (data.error) {
            wrapper.appendChild(detail);
        }
        wrapper.appendChild(closeBtn);

        notificationArea.appendChild(wrapper);

        while (notificationArea.children.length > 3) {
            notificationArea.removeChild(notificationArea.firstChild);
        }
    }

    function formatDateTime(value) {
        if (!value) return '无';
        let date = null;
        if (value instanceof Date) {
            date = value;
        } else if (typeof value === 'string') {
            const normalized = value.includes('T') ? value : value.replace(' ', 'T');
            date = new Date(normalized);
        } else {
            date = new Date(value);
        }
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
            return String(value);
        }
        return date.toLocaleString();
    }

    function formatPlanSchedule(plan = {}) {
        if (plan.cron_expr) {
            return `Cron ${plan.cron_expr}`;
        }
        if (plan.interval) {
            return `每 ${plan.interval} 分钟`;
        }
        return '手动任务';
    }

    function renderDetailHistory(history = []) {
        if (!planDetailHistoryBody) return;
        planDetailHistoryBody.innerHTML = '';
        if (!Array.isArray(history) || history.length === 0) {
            planDetailHistoryBody.innerHTML = '<tr class="no-history"><td colspan="4" class="text-center text-muted py-3">暂无执行记录。</td></tr>';
            return;
        }

        history.forEach((item) => {
            const row = document.createElement('tr');
            row.innerHTML = `<td>${formatDateTime(item.timestamp)}</td><td>${item.result || '未知'}</td><td>${item.bytes_consumed || '0 B'}</td><td>${item.download_count ?? 0}</td>`;
            planDetailHistoryBody.appendChild(row);
        });
    }

    function renderPlanDetail(payload = {}) {
        const summary = payload.summary || {};
        if (planDetailNameEl) {
            planDetailNameEl.textContent = payload.name || '-';
        }
        if (planDetailNextRunEl) {
            planDetailNextRunEl.textContent = formatDateTime(summary.next_run_time);
        }
        if (planDetailTotalEl) {
            planDetailTotalEl.textContent = `${summary.total_bytes || '0 B'} / ${summary.download_count ?? 0}`;
        }
        renderDetailHistory(payload.history || []);
        if (planDetailModal) {
            planDetailModal.show();
        }
    }

    function renderRuntimePlans(plans = []) {
        if (!runtimePlanListEl) return;
        runtimePlanListEl.innerHTML = '';

        if (!Array.isArray(plans) || plans.length === 0) {
            runtimePlanListEl.innerHTML = '<div class="text-muted small py-2">暂无运行计划。</div>';
            return;
        }

        plans.forEach((plan) => {
            const card = document.createElement('div');
            card.className = 'plan-card';

            const header = document.createElement('div');
            header.className = 'plan-card-header';

            const meta = document.createElement('div');
            const title = document.createElement('div');
            title.className = 'plan-card-title';
            title.textContent = plan.name || '未命名计划';

            const subtitle = document.createElement('div');
            subtitle.className = 'plan-card-subtitle';
            const runState = plan.running ? '执行中' : (plan.scheduler_running ? '等待调度' : '已停止');
            subtitle.textContent = `${formatPlanSchedule(plan)} · ${runState}`;

            meta.appendChild(title);
            meta.appendChild(subtitle);

            const badge = document.createElement('span');
            badge.className = `badge ${plan.running ? 'bg-success' : (plan.scheduler_running ? 'bg-info text-dark' : 'bg-secondary')}`;
            badge.textContent = plan.running ? '运行中' : (plan.scheduler_running ? '计划中' : '已停止');

            header.appendChild(meta);
            header.appendChild(badge);

            const metrics = document.createElement('div');
            metrics.className = 'plan-card-metrics';
            metrics.innerHTML = `
                <div class="plan-card-metric">
                    <span class="label">下次执行</span>
                    <span class="value">${formatDateTime(plan.next_run_time)}</span>
                </div>
                <div class="plan-card-metric">
                    <span class="label">累计流量</span>
                    <span class="value">${plan.total_bytes || '0 B'}</span>
                </div>
                <div class="plan-card-metric">
                    <span class="label">累计下载数</span>
                    <span class="value">${plan.download_count ?? 0}</span>
                </div>
                <div class="plan-card-metric">
                    <span class="label">线程 / 链接</span>
                    <span class="value">${plan.threads ?? 0} / ${plan.url_count ?? 0}</span>
                </div>
            `;

            const actions = document.createElement('div');
            actions.className = 'plan-card-actions';

            const detailBtn = document.createElement('button');
            detailBtn.type = 'button';
            detailBtn.className = 'btn btn-sm btn-outline-primary';
            detailBtn.dataset.planAction = 'detail';
            detailBtn.dataset.planName = plan.name || '';
            detailBtn.textContent = '查看详情';

            const stopBtnEl = document.createElement('button');
            stopBtnEl.type = 'button';
            stopBtnEl.className = 'btn btn-sm btn-outline-danger';
            stopBtnEl.dataset.planAction = 'stop';
            stopBtnEl.dataset.planName = plan.name || '';
            stopBtnEl.textContent = '停止该计划';
            stopBtnEl.disabled = !(plan.running || plan.scheduler_running);

            actions.appendChild(detailBtn);
            actions.appendChild(stopBtnEl);

            card.appendChild(header);
            card.appendChild(metrics);
            card.appendChild(actions);
            runtimePlanListEl.appendChild(card);
        });
    }

    // --- Socket.IO 事件处理 ---
    socket.on('connect', () => {
        console.log('已连接到服务器');
        socket.emit('get_configs');
        socket.emit('get_runtime_plans');
    });

    socket.on('configs_list', (data) => {
        const configs = Array.isArray(data.configs) ? data.configs : [];

        if (configSelect) {
            const previousSelection = selectedConfigName;
            configSelect.innerHTML = '';
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = configs.length ? '请选择运行配置' : '暂无配置，请先创建';
            configSelect.appendChild(placeholder);

            configs.forEach((name) => {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name;
                configSelect.appendChild(option);
            });

            if (configs.length > 0) {
                const runtimeSelection = configs.includes(previousSelection) ? previousSelection : configs[0];
                selectedConfigName = runtimeSelection;
                configSelect.value = runtimeSelection;
                requestConfigDetails(runtimeSelection, 'runtime');
            } else {
                selectedConfigName = null;
                selectedConfigDetail = null;
                configSelect.value = '';
            }
        }

        if (editorConfigSelect) {
            const previousEditor = editorActiveConfig || editorConfigSelect.value;
            editorConfigSelect.innerHTML = '';
            const editorPlaceholder = document.createElement('option');
            editorPlaceholder.value = '';
            editorPlaceholder.textContent = '新建配置';
            editorConfigSelect.appendChild(editorPlaceholder);

            configs.forEach((name) => {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name;
                editorConfigSelect.appendChild(option);
            });

            if (previousEditor && configs.includes(previousEditor)) {
                editorConfigSelect.value = previousEditor;
                requestConfigDetails(previousEditor, 'editor');
            } else {
                editorActiveConfig = null;
                editorConfigSelect.value = '';
            }
        }
    });

    socket.on('config_details', (data) => {
        const target = data.target || pendingConfigTarget || 'runtime';
        const name = data.name;
        const config = data.config || {};

        if (target === 'editor') {
            populateEditorForm(name, config);
            editorActiveConfig = name;
            if (editorConfigSelect && editorConfigSelect.value !== name) {
                editorConfigSelect.value = name;
            }
        } else {
            selectedConfigName = name;
            selectedConfigDetail = normalizeConfigPayload(config, name);
            if (configSelect && configSelect.value !== name) {
                configSelect.value = name;
            }
        }

        if (pendingConfigName === name) {
            pendingConfigName = null;
            pendingConfigTarget = null;
        }
    });

    socket.on('status_update', (data) => {
        if (typeof data.running === 'boolean') {
            if (data.running) {
                runningStatus.textContent = '运行中';
                runningStatus.className = 'badge bg-success';
            } else {
                runningStatus.textContent = '已停止';
                runningStatus.className = 'badge bg-secondary';
            }
            startBtn.disabled = data.running;
            stopBtn.disabled = !data.running;
        }
        if (data.speed !== undefined) {
            document.getElementById('speed-text').textContent = data.speed || '0 B/s';
        }
        if (data.total_bytes !== undefined) {
            document.getElementById('total-bytes').textContent = data.total_bytes || '0 B';
        }
        if (data.download_count !== undefined) {
            document.getElementById('download-count').textContent = data.download_count || '0';
        }
        if (currentConfigEl && typeof data.config === 'string') {
            const safeConfigName = typeof data.config === 'string' && data.config.trim()
                ? data.config.trim()
                : '未命名配置';
            currentConfigEl.textContent = safeConfigName;
            currentConfigEl.title = safeConfigName;
        }

        if (data.speed) {
            const speedValue = data.speed.match(/(\d+\.\d+)\s*MB\/s/i);
            const speedMB = speedValue ? parseFloat(speedValue[1]) : 0;
            addDataToChart(new Date().toLocaleTimeString(), speedMB);
        }

        if (data.thread_status !== undefined || data.thread_count !== undefined) {
            renderThreadStatus(data.thread_status, data.thread_count);
        }
        if (data.url_usage_stats !== undefined) {
            renderUrlUsage(data.url_usage_stats);
        }
        if (data.message) {
            pushAlert({
                message: data.message,
                title: '状态更新：',
                variant: data.running ? 'success' : 'secondary'
            });
        }
    });

    socket.on('log_message', (data = {}) => {
        if (!logSwitch.checked) return;
        const initialMessage = logContainer.querySelector('.text-muted');
        if (initialMessage) {
            initialMessage.remove();
        }

        const logEntry = document.createElement('p');
        logEntry.className = 'mb-1 log-line';

        const timestampSpan = document.createElement('span');
        timestampSpan.className = 'text-muted me-2';
        timestampSpan.textContent = `[${new Date().toLocaleTimeString()}]`;

        const messageSpan = document.createElement('span');
        messageSpan.textContent = data.message || '';
        if (data.color) {
            messageSpan.style.color = data.color;
        }

        logEntry.append(timestampSpan, messageSpan);
        logContainer.append(logEntry);

        logContainer.scrollTop = logContainer.scrollHeight;

        while (logContainer.children.length > 200) {
            logContainer.removeChild(logContainer.firstChild);
        }
    });

    socket.on('invalid_url', (data) => {
        pushAlert({
            ...data,
            title: data.title || '下载失败：',
            variant: data.variant || 'danger'
        });
    });

    socket.on('runtime_plans', (data = {}) => {
        renderRuntimePlans(data.plans || []);
    });

    socket.on('plan_detail', (data = {}) => {
        renderPlanDetail(data);
    });

    socket.on('scheduler_status_update', (data) => {
        jobDetailsEl.textContent = data.job_details || '无';
        stopSchedulerBtn.disabled = !data.job_details && !(Array.isArray(data.plans) && data.plans.some((plan) => plan.scheduler_running));

        if (Array.isArray(data.plans)) {
            renderRuntimePlans(data.plans);
        }

        if (data.message) {
            pushAlert({
                message: data.message,
                title: '调度状态：',
                variant: 'info'
            });
        }
    });

    socket.on('error', (data = {}) => {
        pushAlert({
            message: data.message || '发生未知错误。',
            title: '操作失败：',
            variant: 'danger'
        });
    });
    
    // --- 事件监听 ---
    function getConfigFromForm() {
        const raw = {};
        Object.keys(configInputs).forEach((key) => {
            const element = configInputs[key];
            if (!element) {
                raw[key] = null;
                return;
            }
            if (element.type === 'checkbox') {
                raw[key] = Boolean(element.checked);
                return;
            }
            if (key === 'urls') {
                raw.urls = element.value || '';
                return;
            }
            const value = typeof element.value === 'string' ? element.value.trim() : element.value;
            raw[key] = value === '' ? null : value;
        });

        raw.urls = raw.urls
            ? raw.urls
                .split(/\r?\n/)
                .map((url) => url.trim())
                .filter((url) => url !== '')
            : [];

        raw.user_agent = configInputs.user_agent ? configInputs.user_agent.value.trim() : '';
        raw.request_headers = configInputs.request_headers ? configInputs.request_headers.value.trim() : '';
        raw.auto_start = configInputs.auto_start ? Boolean(configInputs.auto_start.checked) : false;
        raw.url_switch_interval = configInputs.url_switch_interval ? configInputs.url_switch_interval.value.trim() : '';
        raw.thread_start_delay = configInputs.thread_start_delay ? configInputs.thread_start_delay.value.trim() : '';

        const normalized = normalizeConfigPayload(raw, raw.name || null);
        normalized.name = raw.name || '';
        return normalized;
    }

    startBtn.addEventListener('click', () => {
        if (!selectedConfigName || !selectedConfigDetail) {
            pushAlert({
                message: '请选择有效的运行配置后再启动。',
                title: '提示：',
                variant: 'warning'
            });
            return;
        }
        const payload = normalizeConfigPayload(selectedConfigDetail, selectedConfigName);
        payload.config_name = selectedConfigName;
        payload.name = selectedConfigName;
        payload.urls = Array.isArray(payload.urls) ? [...payload.urls] : [];
        socket.emit('start_consumer', payload);
    });

    stopBtn.addEventListener('click', () => {
        socket.emit('stop_consumer');
    });

    stopSchedulerBtn.addEventListener('click', () => socket.emit('stop_scheduler'));

    if (runtimePlanListEl) {
        runtimePlanListEl.addEventListener('click', (event) => {
            const button = event.target.closest('[data-plan-action]');
            if (!button) return;

            const planName = button.dataset.planName || '';
            const action = button.dataset.planAction;
            if (!planName) {
                pushAlert({
                    message: '无法识别目标计划。',
                    title: '提示：',
                    variant: 'warning'
                });
                return;
            }

            if (action === 'detail') {
                socket.emit('get_plan_detail', { name: planName });
                return;
            }

            if (action === 'stop') {
                if (!window.confirm(`确定停止计划 "${planName}" 吗？`)) {
                    return;
                }
                socket.emit('stop_runtime_plan', { name: planName });
            }
        });
    }

    if (deleteConfigBtn) {
        deleteConfigBtn.addEventListener('click', () => {
            const targetName = editorActiveConfig || selectedConfigName || (configInputs.name && configInputs.name.value.trim());
            if (!targetName) {
                pushAlert({
                    message: '请先选择或输入要删除的配置。',
                    title: '提示：',
                    variant: 'warning'
                });
                return;
            }
            if (!window.confirm(`确定删除配置 "${targetName}" 吗？`)) {
                return;
            }
            socket.emit('delete_config', { name: targetName });
        });
    }

    saveConfigBtn.addEventListener('click', () => {
        const config = getConfigFromForm();
        if (!config.name) {
            pushAlert({
                message: '请填写配置名称后再保存。',
                title: '提示：',
                variant: 'warning'
            });
            return;
        }
        editorActiveConfig = config.name;
        socket.emit('save_config', { name: config.name, data: config });
    });

    if (configSelect) {
        configSelect.addEventListener('change', () => {
            const value = configSelect.value;
            if (!value) {
                selectedConfigName = null;
                selectedConfigDetail = null;
                return;
            }
            requestConfigDetails(value, 'runtime');
        });
    }

    if (editorConfigSelect) {
        editorConfigSelect.addEventListener('change', () => {
            const value = editorConfigSelect.value;
            if (!value) {
                resetConfigForm(true);
                return;
            }
            requestConfigDetails(value, 'editor');
        });
    }

    if (configEditorEl) {
        configEditorEl.addEventListener('show.bs.offcanvas', () => {
            const preferredName = selectedConfigName || editorActiveConfig || '';
            if (preferredName) {
                if (editorConfigSelect) {
                    editorConfigSelect.value = preferredName;
                }
                requestConfigDetails(preferredName, 'editor');
                return;
            }
            if (editorConfigSelect) {
                editorConfigSelect.value = '';
            }
            resetConfigForm(true);
        });
    }

    if (resetConfigBtn) {
        resetConfigBtn.addEventListener('click', () => {
            resetConfigForm();
        });
    }

    logSwitch.addEventListener('change', () => {
        socket.emit('toggle_logs', { enabled: logSwitch.checked });
        if(logSwitch.checked) {
            const initialMessage = logContainer.querySelector('.text-muted');
            if (initialMessage) {
               initialMessage.textContent = '正在等待日志...';
            }
        }
    });

    clearLogBtn.addEventListener('click', () => {
        logContainer.innerHTML = '<p class="text-muted">日志已清空。</p>';
    });

    // --- Cron 表达式预览 ---
    let debounceTimer;
    if (configInputs.cron_expr) {
        configInputs.cron_expr.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                const cronExpr = configInputs.cron_expr.value;
                if (cronExpr) {
                    fetch('/api/preview_cron', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ cron_expr: cronExpr })
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.error) {
                            cronPreviewEl.innerHTML = `<span class="text-danger">错误: ${data.error}</span>`;
                        } else {
                            let html = '<strong>接下来5次运行时间:</strong><ul>';
                            data.forEach(ts => {
                                html += `<li>${new Date(ts).toLocaleString()}</li>`;
                            });
                            html += '</ul>';
                            cronPreviewEl.innerHTML = html;
                        }
                    })
                    .catch(() => {
                        cronPreviewEl.innerHTML = `<span class="text-danger">请求预览失败</span>`;
                    });
                } else if (cronPreviewEl) {
                    cronPreviewEl.innerHTML = '';
                }
            }, 500);
        });
    }

    document.querySelectorAll('.cron-preset').forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            if (!configInputs.cron_expr) return;
            configInputs.cron_expr.value = e.target.dataset.cron;
            configInputs.cron_expr.dispatchEvent(new Event('input'));
        });
    });

    // --- 初始加载 ---
});
