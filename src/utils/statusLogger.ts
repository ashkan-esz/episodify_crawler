import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import os from 'os';
import process from 'process';
import { performance } from 'perf_hooks';
import cluster from 'cluster';

// ====================== Type Definitions ======================
type Status = 'pending' | 'working' | 'success' | 'failed' | 'warning';
type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type RenderPriority = 'critical' | 'high' | 'normal' | 'low';
type LifecycleEvent = 'pre-render' | 'post-render' | 'step-start' | 'step-complete' |
    'error' | 'performance-warning' | 'emergency-shutdown' | 'shutdown';
type OutputMode = 'auto' | 'fancy' | 'simple' | 'minimal' | 'structured' | 'adaptive';
type SummaryOutput = 'text' | 'json';

interface Step {
    name: string;
    status: Status;
    message: string;
    startTime: number;
    endTime: number;
    retryCount: number;
    dependencies: string[];
    options?: StepOptions;
}

interface StepOptions {
    retries?: number;
    retryDelay?: number;
    critical?: boolean;
    silent?: boolean;
}

interface LoggerOptions {
    outputMode?: OutputMode;
    logLevel?: LogLevel;
    maxBufferSize?: number;
    resourceMonitoring?: boolean;
    enableConsoleIntercept?: boolean;
    structuredLogging?: boolean;
    structuredOutput?: 'json' | 'ndjson';
    distributedTracing?: boolean;
    summaryOutput?: SummaryOutput;
    enablePerformanceAnalysis?: boolean;
    maxHistory?: number;
}

interface LogEntry {
    timestamp: number;
    level: LogLevel;
    message: string;
}

interface StepTiming {
    start: number;
    end: number;
}

interface TraceContext {
    traceId: string;
    name: string;
    start: number;
    children: string[];
}

interface StatusLoggerPlugin {
    name: string;
    version: string;
    initialize(logger: UltimateStatusLogger): void;
}

// ====================== Environment Detection ======================
const isTTY = process.stdout.isTTY;
const isDocker = existsSync('/.dockerenv') ||
    (existsSync('/proc/self/cgroup') &&
        readFileSync('/proc/self/cgroup', 'utf8').includes('docker'));
const isCI = !!process.env.CI;
const isProduction = process.env.NODE_ENV === 'production';
const isKubernetes = !!process.env.KUBERNETES_SERVICE_HOST;
const isServerless = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
const isWorker = cluster.isWorker;

// ====================== Performance Configuration ======================
const getPerformanceProfile = () => {
    if (isServerless) return {
        maxFPS: 1,
        minRenderInterval: 2000,
        spinnerFrames: ['.'],
        mode: 'minimal'
    };

    if (isKubernetes) return {
        maxFPS: 2,
        minRenderInterval: 500,
        spinnerFrames: ['-', '\\', '|', '/'],
        mode: 'structured'
    };

    if (isProduction) return {
        maxFPS: 3,
        minRenderInterval: 333,
        spinnerFrames: ['·', '•', '◦'],
        mode: 'simple'
    };

    if (isDocker) return {
        maxFPS: 5,
        minRenderInterval: 200,
        spinnerFrames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴'],
        mode: 'simple'
    };

    if (isCI) return {
        maxFPS: 2,
        minRenderInterval: 500,
        spinnerFrames: ['.', '..', '...'],
        mode: 'simple'
    };

    return {
        maxFPS: 20,
        minRenderInterval: 50,
        spinnerFrames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
        mode: 'fancy'
    };
};

// ====================== Logger Implementation ======================
export class UltimateStatusLogger {
    private steps: Map<string, Step> = new Map();
    private stepOrder: string[] = [];
    private performanceProfile: ReturnType<typeof getPerformanceProfile>;
    private lastRenderTime = 0;
    private frameCount = 0;
    private spinnerIndex = 0;
    private logBuffer: LogEntry[] = [];
    private originalConsole: Record<string, any> | null = null;
    private statusHeight = 0;
    private resourceMonitorInterval: NodeJS.Timeout | null = null;
    private maxMemoryUsage = 0;
    private cpuUsageStart = process.cpuUsage();
    private renderScheduled = false;
    private startTime = Date.now();
    private stepDependencies: Map<string, string[]> = new Map();
    private stepChildren: Map<string, string[]> = new Map();
    private stepDepth: Map<string, number> = new Map();
    private stepTimings: Map<string, StepTiming> = new Map();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    private lifecycleListeners: Map<LifecycleEvent, Function[]> = new Map();
    private customMetrics: Record<string, {value: any, unit: string, timestamp: number}> = {};
    private hasCriticalError = false;
    private activeTraces: Map<string, TraceContext> = new Map();

    constructor(
        private serviceName: string = 'App',
        private options: LoggerOptions = {}
    ) {
        // Initialize options with defaults
        this.options = {
            outputMode: 'auto',
            logLevel: 'info',
            maxBufferSize: 100,
            resourceMonitoring: false,
            enableConsoleIntercept: true,
            structuredLogging: false,
            structuredOutput: 'json',
            distributedTracing: false,
            summaryOutput: 'text',
            enablePerformanceAnalysis: false,
            maxHistory: 50,
            ...options
        };

        // Detect environment and set performance profile
        this.performanceProfile = getPerformanceProfile();

        // Initialize logger step
        this.addStep('LoggerInit', [], { silent: true });
        this.updateStep('LoggerInit', 'working', 'Initializing logger');

        // Setup interceptors and monitors
        // if (this.options.enableConsoleIntercept && this.shouldUseFancyOutput()) {
        //     this.interceptConsole();
        // }
        if (this.options.enableConsoleIntercept) {
            this.interceptConsole();
        }

        if (this.options.resourceMonitoring) {
            this.startResourceMonitoring();
        }

        // Register core lifecycle hooks
        this.registerLifecycleHook('pre-render', this.collectGarbage.bind(this));
        this.registerLifecycleHook('step-start', this.trackStepStart.bind(this));
        this.registerLifecycleHook('step-complete', this.trackStepComplete.bind(this));
        this.registerLifecycleHook('error', this.handleGlobalError.bind(this));

        // Mark logger initialization complete
        this.updateStep('LoggerInit', 'success', 'Logger ready');
    }

    // ====================== Core Functionality ======================

    addStep(name: string, dependencies: string[] = [], options?: StepOptions) {
        if (!this.steps.has(name)) {
            this.steps.set(name, {
                name,
                status: 'pending',
                message: '',
                startTime: 0,
                endTime: 0,
                retryCount: 0,
                dependencies,
                options
            });
            this.stepOrder.push(name);

            // Update dependency graph
            this.stepDependencies.set(name, dependencies);
            for (const dep of dependencies) {
                if (!this.stepChildren.has(dep)) {
                    this.stepChildren.set(dep, []);
                }
                this.stepChildren.get(dep)?.push(name);
            }

            // Calculate step depth
            const depth = dependencies.length > 0
                ? Math.max(...dependencies.map(d => this.stepDepth.get(d) || 0)) + 1
                : 0;
            this.stepDepth.set(name, depth);
        }
    }

    async executeStep<T>(name: string, action: () => Promise<T>, message = ''): Promise<T> {
        const step = this.steps.get(name);
        if (!step) throw new Error(`Step ${name} not found`);

        this.triggerLifecycleHook('step-start', name);
        this.stepTimings.set(name, { start: performance.now(), end: 0 });

        // Check dependencies
        for (const dep of step.dependencies) {
            const depStep = this.steps.get(dep);
            if (!depStep || depStep.status !== 'success') {
                this.updateStep(name, 'failed', `Dependency ${dep} not satisfied`);
                throw new Error(`Dependency ${dep} not satisfied for ${name}`);
            }
        }

        // Set step as working
        step.startTime = Date.now();
        this.updateStep(name, 'working', message || `Processing ${name}...`);

        try {
            const result = await this.withRetries(name, action, step.options);
            const duration = Date.now() - step.startTime;
            this.stepTimings.get(name)!.end = performance.now();
            this.updateStep(name, 'success', `Completed in ${this.formatDuration(duration)}`);
            this.triggerLifecycleHook('step-complete', name, 'success');
            return result;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            const status = step.options?.critical ? 'failed' : 'warning';
            this.stepTimings.get(name)!.end = performance.now();
            this.updateStep(name, status, errorMsg);
            this.triggerLifecycleHook('step-complete', name, status, error);
            throw error;
        }
    }

    private async withRetries<T>(name: string, action: () => Promise<T>, options?: StepOptions): Promise<T> {
        const step = this.steps.get(name)!;
        const maxRetries = options?.retries || 0;
        const retryDelay = options?.retryDelay || 1000;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            step.retryCount = attempt;
            if (attempt > 0) {
                this.updateStep(name, 'working', `Retry ${attempt}/${maxRetries}...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }

            try {
                return await action();
            } catch (error) {
                if (attempt === maxRetries) {
                    throw error;
                }
            }
        }

        throw new Error('Unexpected error in retry logic');
    }

    updateStep(name: string, status: Status, message = '') {
        const step = this.steps.get(name);
        if (step) {
            step.status = status;
            step.message = message;

            if (status === 'success' || status === 'failed' || status === 'warning') {
                step.endTime = Date.now();
            }

            this.scheduleRender();
        }
    }

    // ====================== Rendering System ======================

    private scheduleRender(priority: RenderPriority = 'normal') {
        if (this.renderScheduled) return;

        this.renderScheduled = true;
        const priorityMap: Record<RenderPriority, number> = {
            critical: 0,
            high: 10,
            normal: 50,
            low: 100
        };

        const delay = Math.max(
            this.performanceProfile.minRenderInterval,
            priorityMap[priority]
        );

        setTimeout(() => {
            this.render();
            this.renderScheduled = false;
        }, delay);
    }

    private render() {
        this.triggerLifecycleHook('pre-render');

        try {
            let mode = this.options.outputMode === 'auto'
                ? this.performanceProfile.mode
                : this.options.outputMode;

            if (mode === 'adaptive') {
                mode = this.determineAdaptiveMode();
            }

            switch (mode) {
                case 'fancy':
                    this.renderFancy();
                    break;
                case 'simple':
                    this.renderSimple();
                    break;
                case 'minimal':
                    this.renderMinimal();
                    break;
                case 'structured':
                    this.emitStructuredLog();
                    break;
                default:
                    this.renderFancy();
            }
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error: any) {
            this.renderFallback();
        }

        this.triggerLifecycleHook('post-render');
    }

    private determineAdaptiveMode(): OutputMode {
        if (!isTTY) return 'structured';

        const terminalWidth = process.stdout.columns || 80;
        if (terminalWidth > 120) return 'fancy';
        if (terminalWidth > 60) return 'simple';
        return 'minimal';
    }

    private renderFancy() {
        if (!isTTY) {
            this.renderSimple();
            return;
        }

        this.clearStatusArea();

        let output = '\x1B[?25l'; // Hide cursor
        output += this.buildStatusHeader();
        output += this.buildStatusTable();
        output += this.buildStatusFooter();

        this.spinnerIndex = (this.spinnerIndex + 1) % this.performanceProfile.spinnerFrames.length;

        process.stdout.write(output);
        this.statusHeight = output.split('\n').length;

        this.flushLogs();
    }

    private clearStatusArea() {
        if (this.statusHeight > 0 && isTTY) {
            for (let i = 0; i < this.statusHeight; i++) {
                process.stdout.write('\x1B[1A\x1B[2K');
            }
        }
    }

    private buildStatusHeader(): string {
        let header = `\n  ${this.serviceName} INITIALIZATION STATUS\n\n`;

        if (this.options.resourceMonitoring) {
            const memory = (this.maxMemoryUsage / 1024 / 1024).toFixed(2);
            const cpu = process.cpuUsage(this.cpuUsageStart).user / 1000;
            header += `  Memory: ${memory} MB | CPU: ${cpu.toFixed(1)} ms\n`;
        }

        return header;
    }

    private buildStatusTable(): string {
        const maxNameWidth = Math.max(10, ...this.stepOrder.map(name => name.length));
        const maxMessageWidth = process.stdout.columns
            ? Math.max(20, process.stdout.columns - maxNameWidth - 40)
            : 40;

        let table = '  STEP';
        table += ' '.repeat(maxNameWidth - 4);
        table += ' STATUS   MESSAGE';
        table += ' '.repeat(maxMessageWidth - 7);
        table += ' DURATION\n';
        table += '  ' + '─'.repeat(maxNameWidth) + ' ──────── ' + '─'.repeat(maxMessageWidth) + ' ─────────\n';

        for (const name of this.stepOrder) {
            const step = this.steps.get(name)!;
            if (step.options?.silent) continue;

            const nameDisplay = name.length > maxNameWidth
                ? name.substring(0, maxNameWidth - 1) + '…'
                : name.padEnd(maxNameWidth);

            const statusConfig = {
                pending: { icon: '🟡', color: '\x1b[33m', text: 'PENDING' },
                working: {
                    icon: this.performanceProfile.spinnerFrames[this.spinnerIndex],
                    color: '\x1b[36m',
                    text: 'WORKING'
                },
                success: { icon: '✅', color: '\x1b[32m', text: 'SUCCESS' },
                failed: { icon: '❌', color: '\x1b[31m', text: 'FAILED ' },
                warning: { icon: '⚠️', color: '\x1b[33m', text: 'WARNING' }
            }[step.status];

            const statusDisplay = `${statusConfig.color}${statusConfig.icon} ${statusConfig.text}\x1b[0m`;

            let messageDisplay = step.message;
            if (messageDisplay.length > maxMessageWidth) {
                messageDisplay = messageDisplay.substring(0, maxMessageWidth - 1) + '…';
            }
            messageDisplay = messageDisplay.padEnd(maxMessageWidth);

            let durationDisplay = '';
            if (step.startTime > 0) {
                const elapsed = step.endTime > 0
                    ? step.endTime - step.startTime
                    : Date.now() - step.startTime;
                durationDisplay = this.formatDuration(elapsed);
            }

            const depth = this.stepDepth.get(name) || 0;
            const indent = '  '.repeat(depth);

            table += `  ${indent}${nameDisplay} ${statusDisplay} ${messageDisplay} ${durationDisplay}\n`;
        }

        return table;
    }

    private buildStatusFooter(): string {
        const completed = Array.from(this.steps.values()).filter(
            s => s.status === 'success' || s.status === 'warning'
        ).length;
        const total = this.steps.size;
        const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

        let footer = '\n  ';
        footer += this.renderProgressBar(progress, 30);
        footer += ` ${progress}% | ${completed}/${total} steps\n`;
        footer += '\x1B[?25h'; // Show cursor

        return footer;
    }

    private renderSimple() {
        let output = '\n';

        for (const name of this.stepOrder) {
            const step = this.steps.get(name)!;
            if (step.options?.silent) continue;

            const statusIcon = {
                pending: '[ ]',
                working: `[${this.performanceProfile.spinnerFrames[this.spinnerIndex]}]`,
                success: '[✓]',
                failed: '[✗]',
                warning: '[!]'
            }[step.status];

            let duration = '';
            if (step.startTime > 0) {
                const elapsed = step.endTime > 0
                    ? step.endTime - step.startTime
                    : Date.now() - step.startTime;
                duration = ` (${this.formatDuration(elapsed)})`;
            }

            const depth = this.stepDepth.get(name) || 0;
            const indent = '  '.repeat(depth);

            output += `[${this.serviceName}] ${indent}${statusIcon} ${step.name}: ${step.message}${duration}\n`;
        }

        const completed = Array.from(this.steps.values()).filter(
            s => s.status === 'success' || s.status === 'warning'
        ).length;
        const total = this.steps.size;
        const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
        output += `[${this.serviceName}] PROGRESS: ${completed}/${total} (${progress}%)\n`;

        process.stdout.write(output);
        this.flushLogs();
        this.spinnerIndex = (this.spinnerIndex + 1) % this.performanceProfile.spinnerFrames.length;
    }

    private renderMinimal() {
        const workingSteps = Array.from(this.steps.values())
            .filter(s => s.status === 'working' && !s.options?.silent);

        if (workingSteps.length === 0) return;

        const step = workingSteps[0];
        const duration = Date.now() - step.startTime;
        const spinner = this.performanceProfile.spinnerFrames[this.spinnerIndex];

        process.stdout.write(`\r${spinner} ${step.name}: ${step.message} (${this.formatDuration(duration)})`);
        this.spinnerIndex = (this.spinnerIndex + 1) % this.performanceProfile.spinnerFrames.length;
    }

    private renderFallback() {
        const now = Date.now();
        let output = `[${new Date(now).toISOString()}] [STATUS] ${this.serviceName} Status\n`;

        for (const name of this.stepOrder) {
            const step = this.steps.get(name)!;
            if (step.options?.silent) continue;

            output += `  ${name}: ${step.status} - ${step.message}\n`;
        }

        process.stdout.write(output);
    }

    private renderProgressBar(percent: number, width = 30): string {
        const completed = Math.round((width * percent) / 100);
        const remaining = width - completed;
        return '[' +
            '\x1b[42m' + ' '.repeat(completed) +
            '\x1b[0m' +
            (percent < 100 ? '\x1b[41m' : '\x1b[0m') +
            ' '.repeat(remaining) +
            '\x1b[0m' + ']';
    }

    // ====================== Log Management ======================

    private interceptConsole() {
        this.originalConsole = {
            log: console.log,
            error: console.error,
            warn: console.warn,
            info: console.info,
            debug: console.debug,
            trace: console.trace
        };

        const intercept = (method: string, level: LogLevel) => {
            return (...args: any[]) => {
                this.bufferLog(level, args);

                if (level === 'error') {
                    this.scheduleRender('critical');
                }
            };
        };

        console.log = intercept('log', 'info');
        console.info = intercept('info', 'info');
        console.warn = intercept('warn', 'warn');
        console.error = intercept('error', 'error');
        console.debug = intercept('debug', 'debug');
        console.trace = intercept('trace', 'debug');
    }

    private bufferLog(level: LogLevel, args: any[]) {
        if (this.shouldLog(level)) {
            const message = args.map(arg =>
                typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
            ).join(' ');

            if (this.logBuffer.length >= (this.options.maxBufferSize || 100)) {
                this.logBuffer.shift();
            }

            this.logBuffer.push({
                timestamp: Date.now(),
                level,
                message
            });
        }
    }

    private shouldLog(level: LogLevel): boolean {
        const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
        const minLevel = levels.indexOf(this.options.logLevel || 'info');
        return levels.indexOf(level) >= minLevel;
    }

    private flushLogs() {
        if (this.logBuffer.length > 0) {
            const logs = this.logBuffer.map(entry => {
                const prefix = `[${new Date(entry.timestamp).toISOString()}] [${entry.level.toUpperCase()}]`;
                return `${prefix} ${entry.message}`;
            }).join('\n');

            process.stdout.write('\n' + logs + '\n');
            this.logBuffer = [];
        }
    }

    // ====================== Utility Methods ======================

    private formatDuration(ms: number): string {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
        return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
    }

    private shouldUseFancyOutput(): boolean {
        if (this.options.outputMode === 'fancy') return true;
        if (this.options.outputMode === 'simple') return false;
        return isTTY && !isDocker && !isCI && !isProduction;
    }

    // ====================== Lifecycle Hooks ======================

    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    registerLifecycleHook(event: LifecycleEvent, callback: Function) {
        if (!this.lifecycleListeners.has(event)) {
            this.lifecycleListeners.set(event, []);
        }
        this.lifecycleListeners.get(event)?.push(callback);
    }

    private triggerLifecycleHook(event: LifecycleEvent, ...args: any[]) {
        const listeners = this.lifecycleListeners.get(event) || [];
        for (const listener of listeners) {
            try {
                listener(...args);
            } catch (hookError) {
                console.error(`Lifecycle hook error (${event}):`, hookError);
            }
        }
    }

    private trackStepStart(name: string) {
        this.stepTimings.set(name, { start: performance.now(), end: 0 });
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private trackStepComplete(name: string, status: string, error?: any) {
        const step = this.steps.get(name);
        if (step) {
            this.stepTimings.set(name, {
                ...this.stepTimings.get(name)!,
                end: performance.now()
            });
        }
    }

    // ====================== Resource Monitoring ======================

    private startResourceMonitoring() {
        this.resourceMonitorInterval = setInterval(() => {
            const memory = process.memoryUsage().rss;
            if (memory > this.maxMemoryUsage) {
                this.maxMemoryUsage = memory;
            }
        }, 1000);
    }

    // ====================== Error Handling ======================

    private handleGlobalError(step: string, error: Error) {
        const stepConfig = this.steps.get(step)?.options;
        if (stepConfig?.critical) {
            this.hasCriticalError = true;
            this.saveDiagnosticSnapshot();
            this.triggerLifecycleHook('emergency-shutdown', error);
        }
    }

    private saveDiagnosticSnapshot() {
        const snapshot = {
            timestamp: Date.now(),
            steps: Array.from(this.steps.entries()),
            metrics: this.customMetrics,
            logs: this.logBuffer.slice(-100),
            environment: {
                node: process.version,
                os: `${os.platform()}/${os.release()}`,
                memory: os.totalmem(),
                cpus: os.cpus().length
            }
        };

        try {
            mkdirSync('./diagnostics', { recursive: true });
            writeFileSync(`./diagnostics/snapshot-${Date.now()}.json`, JSON.stringify(snapshot, null, 2));
        } catch (error) {
            console.error('Failed to save diagnostic snapshot:', error);
        }
    }

    // ====================== Structured Logging ======================

    private emitStructuredLog() {
        const logEntry = {
            timestamp: new Date().toISOString(),
            service: this.serviceName,
            type: 'status',
            data: {
                steps: this.stepOrder.map(name => {
                    const step = this.steps.get(name)!;
                    return {
                        name,
                        status: step.status,
                        message: step.message,
                        duration: step.startTime > 0 ? Date.now() - step.startTime : null
                    };
                }),
                metrics: this.customMetrics,
                progress: this.calculateProgress()
            }
        };

        if (this.options.structuredOutput === 'ndjson') {
            process.stdout.write(JSON.stringify(logEntry) + '\n');
        } else {
            console.log(JSON.stringify(logEntry, null, 2));
        }
    }

    private calculateProgress(): number {
        const completed = Array.from(this.steps.values()).filter(
            s => s.status === 'success' || s.status === 'warning'
        ).length;
        const total = this.steps.size;
        return total > 0 ? Math.round((completed / total) * 100) : 0;
    }

    // ====================== Tracing ======================

    startTrace(name: string): TraceContext {
        const traceId = `trace_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        const trace: TraceContext = {
            traceId,
            name,
            start: performance.now(),
            children: []
        };
        this.activeTraces.set(traceId, trace);
        return trace;
    }

    endTrace(trace: TraceContext, status: 'success' | 'failed' = 'success') {
        const duration = performance.now() - trace.start;
        this.activeTraces.delete(trace.traceId);

        // Create a step for the trace
        const stepName = `Trace:${trace.name}`;
        this.addStep(stepName, trace.children.map(c => `Trace:${c}`), { silent: true });
        this.updateStep(stepName, status, `${status} in ${this.formatDuration(duration)}`);

        // Emit structured trace
        if (this.options.distributedTracing) {
            this.emitStructuredTrace(trace, duration, status);
        }
    }

    private emitStructuredTrace(trace: TraceContext, duration: number, status: string) {
        const traceEntry = {
            traceId: trace.traceId,
            service: this.serviceName,
            name: trace.name,
            start: trace.start,
            duration,
            status,
            children: trace.children
        };

        if (this.options.structuredOutput === 'ndjson') {
            process.stdout.write(JSON.stringify(traceEntry) + '\n');
        } else {
            console.log(JSON.stringify(traceEntry, null, 2));
        }
    }

    // ====================== Garbage Collection ======================

    private collectGarbage() {
        // Clean up old steps
        // const now = Date.now();
        const maxHistory = this.options.maxHistory || 50;

        if (this.stepOrder.length > maxHistory) {
            const toRemove = this.stepOrder.slice(0, this.stepOrder.length - maxHistory);
            for (const name of toRemove) {
                this.steps.delete(name);
                this.stepTimings.delete(name);
            }
            this.stepOrder = this.stepOrder.slice(-maxHistory);
        }

        // Clean up log buffer
        if (this.logBuffer.length > (this.options.maxBufferSize || 100)) {
            this.logBuffer = this.logBuffer.slice(-(this.options.maxBufferSize || 100));
        }
    }

    // ====================== Completion ======================

    complete() {
        // Final render
        this.render();

        // Clean up resources
        if (this.resourceMonitorInterval) {
            clearInterval(this.resourceMonitorInterval);
        }

        if (this.originalConsole) {
            Object.assign(console, this.originalConsole);
        }

        // Generate summary
        // this.generateSummaryReport();

        // Trigger shutdown hook
        this.triggerLifecycleHook('shutdown');

        // Special handling for worker processes
        if (isWorker) {
            process.send!({ type: 'init-complete', success: !this.hasCriticalError });
        }
    }

    private generateSummaryReport() {
        const report = {
            service: this.serviceName,
            timestamp: new Date().toISOString(),
            duration: Date.now() - this.startTime,
            steps: {
                total: this.stepOrder.length,
                success: Array.from(this.steps.values()).filter(s => s.status === 'success').length,
                warning: Array.from(this.steps.values()).filter(s => s.status === 'warning').length,
                failed: Array.from(this.steps.values()).filter(s => s.status === 'failed').length
            },
            metrics: this.customMetrics,
            performance: Array.from(this.stepTimings.entries()).map(([name, timing]) => ({
                name,
                duration: timing.end - timing.start
            }))
        };

        if (this.options.summaryOutput === 'json') {
            console.log(JSON.stringify(report, null, 2));
        } else {
            console.log('\n===== INITIALIZATION SUMMARY =====');
            console.log(`Service: ${report.service}`);
            console.log(`Duration: ${this.formatDuration(report.duration)}`);
            console.log(`Steps: ${report.steps.success} ✓ | ` +
                `${report.steps.warning} ⚠ | ${report.steps.failed} ✗ of ${report.steps.total}`);

            // Show the slowest steps
            const slowSteps = [...report.performance]
                .sort((a, b) => b.duration - a.duration)
                .slice(0, 5);

            if (slowSteps.length > 0) {
                console.log('\nSlowest Steps:');
                for (const step of slowSteps) {
                    console.log(`  ${step.name}: ${this.formatDuration(step.duration)}`);
                }
            }
        }
    }

    // ====================== Metrics ======================

    setMetric(name: string, value: any, unit: string = '') {
        this.customMetrics[name] = { value, unit, timestamp: Date.now() };
        this.scheduleRender();
    }

    incrementMetric(name: string, amount: number = 1) {
        if (!this.customMetrics[name]) {
            this.customMetrics[name] = { value: 0, unit: 'count', timestamp: Date.now() };
        }
        this.customMetrics[name].value += amount;
        this.customMetrics[name].timestamp = Date.now();
        this.scheduleRender();
    }
}

// ====================== Plugin System ======================
export class PluginManager {
    private plugins: Map<string, StatusLoggerPlugin> = new Map();

    constructor(private logger: UltimateStatusLogger) {}

    register(plugin: StatusLoggerPlugin) {
        if (this.plugins.has(plugin.name)) {
            console.warn(`Plugin ${plugin.name} already registered`);
            return;
        }

        try {
            plugin.initialize(this.logger);
            this.plugins.set(plugin.name, plugin);
            this.logger.setMetric(`plugin_${plugin.name}`, 'active');
        } catch (error) {
            console.error(`Failed to initialize plugin ${plugin.name}:`, error);
        }
    }

    unregister(name: string) {
        if (this.plugins.has(name)) {
            this.plugins.delete(name);
            this.logger.setMetric(`plugin_${name}`, 'inactive');
        }
    }
}

// ====================== Built-in Plugins ======================
export class ErrorReportingPlugin implements StatusLoggerPlugin {
    name = 'error-reporting';
    version = '1.0';

    initialize(logger: UltimateStatusLogger) {
        logger.registerLifecycleHook('step-complete',
            (name: string, status: string, error?: Error) => {
                if (status === 'failed' && error) {
                    this.reportError(error, name);
                }
            });
    }

    private reportError(error: Error, step: string) {
        // In a real implementation, this would send to an error tracking service
        console.error(`[ERROR REPORT] Step: ${step}`, error);
    }
}
