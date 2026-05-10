package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/spf13/pflag"

	"video-agent-claude-wangbo/internal/config"
	"video-agent-claude-wangbo/internal/download"
	"video-agent-claude-wangbo/internal/gateway"
	"video-agent-claude-wangbo/internal/payload"
	"video-agent-claude-wangbo/internal/postprocess"
	"video-agent-claude-wangbo/internal/runstate"
	"video-agent-claude-wangbo/internal/upload"
	"video-agent-claude-wangbo/internal/validate"
)

type submitOptions struct {
	DryRun        bool
	Wait          bool
	Timeout       time.Duration
	PollInterval  time.Duration
	RunDir        string
	ResumeLatest  bool
	Force         bool
	AllowNonOSS   bool
	AllowTextOnly bool
	JSONOutput    bool
}

type submitOutcome struct {
	Status   string
	RunDir   string
	VideoURL string
	Request  map[string]any
}

func Main(args []string) int {
	if len(args) == 0 {
		printUsage()
		return 2
	}

	switch args[0] {
	case "upload":
		return runUpload(args[1:])
	case "payload":
		return runPayload(args[1:])
	case "validate":
		return runValidate(args[1:])
	case "submit":
		return runSubmit(args[1:])
	case "status":
		return runStatus(args[1:])
	case "download":
		return runDownload(args[1:])
	case "extract-end-frame":
		return runExtractEndFrame(args[1:])
	case "extract-candidates":
		return runExtractCandidates(args[1:])
	case "select-spatial-frame":
		return runSelectSpatialFrame(args[1:])
	case "run-shot":
		return runShot(args[1:])
	case "help", "-h", "--help":
		printUsage()
		return 0
	default:
		fmt.Fprintf(os.Stderr, "ERROR: unknown command %q\n", args[0])
		printUsage()
		return 2
	}
}

func runUpload(args []string) int {
	flags := pflag.NewFlagSet("upload", pflag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	folder := flags.String("folder", "", "OSS folder, e.g. public/image or public/video")
	timeoutSeconds := flags.Int("timeout", 300, "upload timeout in seconds")
	noSidecar := flags.Bool("no-sidecar", false, "do not write <file>.url sidecars")
	jsonOutput := flags.Bool("json", false, "print JSON output")
	if err := flags.Parse(args); err != nil {
		return 2
	}
	if flags.NArg() == 0 {
		fmt.Fprintln(os.Stderr, "ERROR: usage: videoctl upload <file...>")
		return 2
	}

	cfg, err := config.Load(".")
	if err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
		return 1
	}
	results := upload.UploadFiles(context.Background(), flags.Args(), upload.Options{
		Config:    cfg,
		Folder:    *folder,
		Timeout:   time.Duration(*timeoutSeconds) * time.Second,
		NoSidecar: *noSidecar,
	})
	if *jsonOutput {
		printJSON(map[string]any{"results": results})
	}

	ok := true
	if !*jsonOutput {
		for _, result := range results {
			if result.OK {
				fmt.Printf("OK %s -> %s\n", result.Path, result.URL)
				if result.Sidecar != "" {
					fmt.Printf("OK sidecar -> %s\n", result.Sidecar)
				}
			} else {
				ok = false
				fmt.Fprintf(os.Stderr, "FAIL %s: %s\n", result.Path, result.Error)
			}
		}
	} else {
		for _, result := range results {
			if !result.OK {
				ok = false
				break
			}
		}
	}
	if !ok {
		return 1
	}
	return 0
}

func runPayload(args []string) int {
	flags := pflag.NewFlagSet("payload", pflag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	allowNonOSS := flags.Bool("allow-non-oss", false, "allow generic http(s) URLs")
	allowTextOnly := flags.Bool("allow-text-only", false, "allow payloads without sourceImageUrl")
	_ = flags.Bool("json", true, "print JSON output")
	if err := flags.Parse(args); err != nil {
		return 2
	}
	if flags.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "ERROR: usage: videoctl payload <prompt.md>")
		return 2
	}

	cfg, err := loadConfigForPath(flags.Arg(0))
	if err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
		return 1
	}

	built, err := payload.Build(flags.Arg(0), payload.Options{
		ProjectRoot:   cfg.ProjectRoot,
		AllowNonOSS:   *allowNonOSS,
		AllowTextOnly: *allowTextOnly,
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
		return 1
	}
	printJSON(built)
	return 0
}

func runValidate(args []string) int {
	flags := pflag.NewFlagSet("validate", pflag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	timeoutSeconds := flags.Int("timeout", 300, "URL timeout in seconds")
	allowNonOSS := flags.Bool("allow-non-oss", false, "allow generic http(s) URLs")
	allowEmpty := flags.Bool("allow-empty", false, "allow prompts without media references")
	jsonOutput := flags.Bool("json", false, "print JSON output")
	if err := flags.Parse(args); err != nil {
		return 2
	}
	if flags.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "ERROR: usage: videoctl validate <prompt.md>")
		return 2
	}

	cfg, err := loadConfigForPath(flags.Arg(0))
	if err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
		return 1
	}

	ok, results := validate.Validate(flags.Arg(0), validate.Options{
		ProjectRoot: cfg.ProjectRoot,
		Timeout:     time.Duration(*timeoutSeconds) * time.Second,
		AllowNonOSS: *allowNonOSS,
		AllowEmpty:  *allowEmpty,
	})

	if *jsonOutput {
		printJSON(map[string]any{"ok": ok, "results": results})
	} else {
		printValidationResults(ok, results)
	}
	if !ok {
		return 1
	}
	return 0
}

func runSubmit(args []string) int {
	flags := pflag.NewFlagSet("submit", pflag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	dryRun := flags.Bool("dry-run", false, "build request without calling the gateway")
	wait := flags.Bool("wait", false, "wait for terminal result")
	timeoutSeconds := flags.Int("timeout", 1200, "generation timeout in seconds")
	pollSeconds := flags.Int("poll", 30, "poll interval in seconds")
	runDirFlag := flags.String("run-dir", "", "explicit run directory")
	resumeLatest := flags.Bool("resume-latest", false, "show the latest run status")
	force := flags.Bool("force", false, "force a new run even if latest run is active or succeeded")
	allowNonOSS := flags.Bool("allow-non-oss", false, "allow generic http(s) URLs")
	allowTextOnly := flags.Bool("allow-text-only", false, "allow payloads without sourceImageUrl")
	jsonOutput := flags.Bool("json", false, "print JSON output")
	if err := flags.Parse(args); err != nil {
		return 2
	}
	if flags.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "ERROR: usage: videoctl submit <prompt.md> [--dry-run|--wait]")
		return 2
	}

	outcome, code := submitPrompt(flags.Arg(0), submitOptions{
		DryRun:        *dryRun,
		Wait:          *wait,
		Timeout:       time.Duration(*timeoutSeconds) * time.Second,
		PollInterval:  time.Duration(*pollSeconds) * time.Second,
		RunDir:        *runDirFlag,
		ResumeLatest:  *resumeLatest,
		Force:         *force,
		AllowNonOSS:   *allowNonOSS,
		AllowTextOnly: *allowTextOnly,
		JSONOutput:    *jsonOutput,
	})
	if outcome != nil && *jsonOutput {
		printJSON(outcome)
	} else if outcome != nil && outcome.Status == "dry_run" && outcome.RunDir == "" {
		printJSON(outcome.Request)
	}
	return code
}

func runStatus(args []string) int {
	flags := pflag.NewFlagSet("status", pflag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	jsonOutput := flags.Bool("json", false, "print JSON output")
	if err := flags.Parse(args); err != nil {
		return 2
	}
	if flags.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "ERROR: usage: videoctl status <run-dir>")
		return 2
	}
	return printStatus(flags.Arg(0), *jsonOutput)
}

func runDownload(args []string) int {
	flags := pflag.NewFlagSet("download", pflag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	out := flags.String("out", "", "output video path")
	urlFile := flags.String("url-file", "", "file containing generated video URL")
	timeoutSeconds := flags.Int("timeout", 600, "download timeout in seconds")
	noSidecar := flags.Bool("no-sidecar", false, "do not write <out>.url sidecar")
	jsonOutput := flags.Bool("json", false, "print JSON output")
	if err := flags.Parse(args); err != nil {
		return 2
	}
	if *out == "" || (flags.NArg() == 0 && *urlFile == "") || (flags.NArg() > 1) || (flags.NArg() == 1 && *urlFile != "") {
		fmt.Fprintln(os.Stderr, "ERROR: usage: videoctl download <video_url> --out <shot.mp4>")
		return 2
	}

	urlValue := ""
	if *urlFile != "" {
		value, err := download.ReadURLFile(*urlFile)
		if err != nil {
			fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
			return 1
		}
		urlValue = value
	} else {
		urlValue = flags.Arg(0)
	}
	output, sidecar, err := download.Download(context.Background(), urlValue, *out, download.Options{
		Timeout:   time.Duration(*timeoutSeconds) * time.Second,
		NoSidecar: *noSidecar,
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
		return 1
	}
	if *jsonOutput {
		printJSON(map[string]any{"output": output, "sidecar": sidecar, "url": urlValue})
	} else {
		fmt.Printf("OK video -> %s\n", output)
		if sidecar != "" {
			fmt.Printf("OK url sidecar -> %s\n", sidecar)
		}
	}
	return 0
}

func runExtractEndFrame(args []string) int {
	flags := pflag.NewFlagSet("extract-end-frame", pflag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	offset := flags.Float64("offset", 0.1, "seconds before video end")
	if err := flags.Parse(args); err != nil {
		return 2
	}
	if flags.NArg() != 2 {
		fmt.Fprintln(os.Stderr, "ERROR: usage: videoctl extract-end-frame <shot.mp4> <shot_end.png>")
		return 2
	}
	if err := postprocess.ExtractEndFrame(context.Background(), flags.Arg(0), flags.Arg(1), *offset); err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
		return 1
	}
	fmt.Printf("OK end frame -> %s\n", flags.Arg(1))
	return 0
}

func runExtractCandidates(args []string) int {
	flags := pflag.NewFlagSet("extract-candidates", pflag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	shotID := flags.String("shot-id", "", "candidate filename prefix; defaults to video stem")
	interval := flags.Float64("interval", 2.0, "seconds between candidates")
	if err := flags.Parse(args); err != nil {
		return 2
	}
	if flags.NArg() != 2 {
		fmt.Fprintln(os.Stderr, "ERROR: usage: videoctl extract-candidates <shot.mp4> <out_dir> --shot-id <shot_id>")
		return 2
	}
	outputs, err := postprocess.ExtractCandidates(context.Background(), flags.Arg(0), flags.Arg(1), *shotID, *interval)
	if err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
		return 1
	}
	for _, output := range outputs {
		fmt.Println(output)
	}
	fmt.Printf("OK %d candidates\n", len(outputs))
	return 0
}

func runSelectSpatialFrame(args []string) int {
	flags := pflag.NewFlagSet("select-spatial-frame", pflag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	if err := flags.Parse(args); err != nil {
		return 2
	}
	if flags.NArg() != 2 {
		fmt.Fprintln(os.Stderr, "ERROR: usage: videoctl select-spatial-frame <candidate.png> <shot_spatial.png>")
		return 2
	}
	if err := postprocess.SelectSpatialFrame(flags.Arg(0), flags.Arg(1)); err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
		return 1
	}
	fmt.Printf("OK spatial frame -> %s\n", flags.Arg(1))
	return 0
}

func runShot(args []string) int {
	flags := pflag.NewFlagSet("run-shot", pflag.ContinueOnError)
	flags.SetOutput(os.Stderr)
	downloadVideo := flags.Bool("download", false, "download generated video after success")
	extractEndFrame := flags.Bool("extract-end-frame", false, "download if needed and extract the end frame")
	videoOut := flags.String("video-out", "", "download output path; defaults to episode videos/<shot_id>.mp4")
	endFrameOut := flags.String("end-frame-out", "", "end frame path; defaults to episode end-frames/<shot_id>_end.png")
	timeoutSeconds := flags.Int("timeout", 1200, "generation timeout in seconds")
	pollSeconds := flags.Int("poll", 30, "poll interval in seconds")
	runDirFlag := flags.String("run-dir", "", "explicit run directory")
	force := flags.Bool("force", false, "force a new run")
	allowNonOSS := flags.Bool("allow-non-oss", false, "allow generic http(s) URLs")
	allowTextOnly := flags.Bool("allow-text-only", false, "allow payloads without sourceImageUrl")
	jsonOutput := flags.Bool("json", false, "print JSON output")
	if err := flags.Parse(args); err != nil {
		return 2
	}
	if flags.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "ERROR: usage: videoctl run-shot <prompt.md> --download --extract-end-frame")
		return 2
	}

	outcome, code := submitPrompt(flags.Arg(0), submitOptions{
		Wait:          true,
		Timeout:       time.Duration(*timeoutSeconds) * time.Second,
		PollInterval:  time.Duration(*pollSeconds) * time.Second,
		RunDir:        *runDirFlag,
		Force:         *force,
		AllowNonOSS:   *allowNonOSS,
		AllowTextOnly: *allowTextOnly,
		JSONOutput:    false,
	})
	if code != 0 || outcome == nil {
		return code
	}

	result := map[string]any{"status": outcome.Status, "run_dir": outcome.RunDir, "video_url": outcome.VideoURL}
	if *downloadVideo || *extractEndFrame {
		outputPath := *videoOut
		if outputPath == "" {
			outputPath = defaultVideoOutput(flags.Arg(0))
		}
		downloaded, sidecar, err := download.Download(context.Background(), outcome.VideoURL, outputPath, download.Options{})
		if err != nil {
			fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
			return 1
		}
		result["video_path"] = downloaded
		result["video_sidecar"] = sidecar
		if !*jsonOutput {
			fmt.Printf("OK video file -> %s\n", downloaded)
		}

		if *extractEndFrame {
			endPath := *endFrameOut
			if endPath == "" {
				endPath = defaultEndFrameOutput(flags.Arg(0))
			}
			if err := postprocess.ExtractEndFrame(context.Background(), downloaded, endPath, 0.1); err != nil {
				fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
				return 1
			}
			result["end_frame"] = endPath
			if !*jsonOutput {
				fmt.Printf("OK end frame -> %s\n", endPath)
			}
		}
	}

	if *jsonOutput {
		printJSON(result)
	}
	return 0
}

func submitPrompt(rawPromptPath string, opts submitOptions) (*submitOutcome, int) {
	promptPath, err := filepath.Abs(rawPromptPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
		return nil, 1
	}

	cfg, err := loadConfigForPath(promptPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
		return nil, 1
	}

	if opts.ResumeLatest {
		latest, ok, err := runstate.LatestRunDir(promptPath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
			return nil, 1
		}
		if !ok {
			fmt.Fprintln(os.Stderr, "ERROR: no latest run to resume")
			return nil, 1
		}
		code := printStatus(latest, opts.JSONOutput)
		if code != 0 {
			return nil, code
		}
		state, err := runstate.ReadState(latest)
		if err != nil {
			fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
			return nil, 1
		}
		return &submitOutcome{Status: state.Status, RunDir: latest, VideoURL: state.VideoURL}, 0
	}

	if !opts.Force && !opts.DryRun {
		if latest, ok, err := runstate.LatestRunDir(promptPath); err != nil {
			fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
			return nil, 1
		} else if ok {
			if state, err := runstate.ReadState(latest); err == nil {
				if state.Status == "succeeded" {
					fmt.Fprintf(os.Stderr, "ERROR: latest run already succeeded at %s; use --force to submit again\n", latest)
					return nil, 1
				}
				if !runstate.IsTerminal(state.Status) {
					fmt.Fprintf(os.Stderr, "ERROR: latest run is non-terminal at %s; use --resume-latest or --force\n", latest)
					return nil, 1
				}
			}
		}
	}

	requestPayload, err := payload.Build(promptPath, payload.Options{
		ProjectRoot:   cfg.ProjectRoot,
		AllowNonOSS:   opts.AllowNonOSS,
		AllowTextOnly: opts.AllowTextOnly,
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
		return nil, 1
	}

	if opts.DryRun && opts.RunDir == "" {
		return &submitOutcome{Status: "dry_run", Request: requestPayload}, 0
	}

	runDir, err := runstate.CreateRunDir(promptPath, opts.RunDir, time.Now())
	if err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
		return nil, 1
	}
	if err := runstate.WriteJSON(filepath.Join(runDir, "request.json"), requestPayload); err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
		return nil, 1
	}

	if opts.DryRun {
		state := runstate.State{Status: "dry_run", PromptPath: promptPath}
		if err := runstate.WriteState(runDir, state); err != nil {
			fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
			return nil, 1
		}
		if !opts.JSONOutput {
			fmt.Printf("OK dry-run request -> %s\n", filepath.Join(runDir, "request.json"))
		}
		return &submitOutcome{Status: "dry_run", RunDir: runDir, Request: requestPayload}, 0
	}

	ok, results := validate.Validate(promptPath, validate.Options{
		ProjectRoot: cfg.ProjectRoot,
		Timeout:     300 * time.Second,
		AllowNonOSS: opts.AllowNonOSS,
	})
	if !ok {
		_ = runstate.WriteJSON(filepath.Join(runDir, "error.json"), map[string]any{"error": "URL validation failed", "results": results})
		_ = runstate.WriteState(runDir, runstate.State{Status: "failed", PromptPath: promptPath, Error: "URL validation failed"})
		printValidationResults(false, results)
		return nil, 1
	}

	timeout := opts.Timeout
	if timeout <= 0 {
		timeout = 1200 * time.Second
	}
	poll := opts.PollInterval
	if poll <= 0 {
		poll = 30 * time.Second
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout+30*time.Second)
	defer cancel()

	client := gateway.Client{
		Config:     cfg,
		HTTPClient: &http.Client{Timeout: timeout + 30*time.Second},
	}
	submitResult, err := client.Submit(ctx, requestPayload)
	if err != nil {
		_ = runstate.WriteJSON(filepath.Join(runDir, "error.json"), map[string]any{"error": err.Error()})
		_ = runstate.WriteState(runDir, runstate.State{Status: "failed", PromptPath: promptPath, Error: err.Error()})
		fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
		return nil, 1
	}
	if err := runstate.WriteJSON(filepath.Join(runDir, "submit-response.json"), submitResult.Raw); err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
		return nil, 1
	}

	if submitResult.VideoURL != "" {
		return writeSuccess(runDir, promptPath, submitResult.VideoURL, submitResult.Raw, opts.JSONOutput)
	}

	if !opts.Wait {
		state := runstate.State{Status: "submitted", PromptPath: promptPath, SubmittedAt: time.Now().UTC().Format(time.RFC3339)}
		if err := runstate.WriteState(runDir, state); err != nil {
			fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
			return nil, 1
		}
		if !opts.JSONOutput {
			fmt.Printf("OK submitted -> %s\n", runDir)
		}
		return &submitOutcome{Status: "submitted", RunDir: runDir}, 0
	}

	pollResult, err := client.Poll(ctx, submitResult.TaskID, submitResult.StatusURL, timeout, poll, func(result gateway.PollResult) error {
		return runstate.AppendJSONL(filepath.Join(runDir, "poll.jsonl"), result)
	})
	if err != nil {
		_ = runstate.WriteJSON(filepath.Join(runDir, "error.json"), map[string]any{"error": err.Error(), "last_poll": pollResult})
		status := "failed"
		if pollResult != nil && pollResult.Status == "timeout" {
			status = "timeout"
		}
		_ = runstate.WriteState(runDir, runstate.State{Status: status, PromptPath: promptPath, Error: err.Error()})
		fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
		return nil, 1
	}
	if pollResult.VideoURL == "" {
		err := fmt.Errorf("gateway reached success state but did not return a video URL")
		_ = runstate.WriteJSON(filepath.Join(runDir, "error.json"), map[string]any{"error": err.Error(), "last_poll": pollResult})
		_ = runstate.WriteState(runDir, runstate.State{Status: "failed", PromptPath: promptPath, Error: err.Error()})
		fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
		return nil, 1
	}
	return writeSuccess(runDir, promptPath, pollResult.VideoURL, pollResult.Raw, opts.JSONOutput)
}

func loadConfigForPath(path string) (*config.Config, error) {
	start := path
	if info, err := os.Stat(path); err == nil && !info.IsDir() {
		start = filepath.Dir(path)
	}
	cfg, err := config.Load(start)
	if err == nil {
		return cfg, nil
	}
	cwd, cwdErr := os.Getwd()
	if cwdErr != nil {
		return nil, err
	}
	return config.Load(cwd)
}

func writeSuccess(runDir string, promptPath string, videoURL string, raw map[string]any, jsonOutput bool) (*submitOutcome, int) {
	if err := runstate.WriteJSON(filepath.Join(runDir, "result.json"), map[string]any{"video_url": videoURL, "raw": raw}); err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
		return nil, 1
	}
	if err := runstate.WriteString(filepath.Join(runDir, "video.url"), videoURL+"\n"); err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
		return nil, 1
	}
	state := runstate.State{Status: "succeeded", PromptPath: promptPath, VideoURL: videoURL}
	if err := runstate.WriteState(runDir, state); err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
		return nil, 1
	}
	if !jsonOutput {
		fmt.Printf("OK video -> %s\n", videoURL)
		fmt.Printf("OK run -> %s\n", runDir)
	}
	return &submitOutcome{Status: "succeeded", RunDir: runDir, VideoURL: videoURL}, 0
}

func printStatus(runDir string, jsonOutput bool) int {
	state, err := runstate.ReadState(runDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
		return 1
	}
	if jsonOutput {
		printJSON(state)
		return 0
	}
	fmt.Printf("status: %s\n", state.Status)
	if state.VideoURL != "" {
		fmt.Printf("video_url: %s\n", state.VideoURL)
	}
	if state.Error != "" {
		fmt.Printf("error: %s\n", state.Error)
	}
	fmt.Printf("run_dir: %s\n", runDir)
	return 0
}

func defaultVideoOutput(promptPath string) string {
	promptAbs, err := filepath.Abs(promptPath)
	if err != nil {
		promptAbs = promptPath
	}
	shotDir := filepath.Dir(promptAbs)
	shotID := filepath.Base(shotDir)
	episodeDir := filepath.Dir(filepath.Dir(shotDir))
	return filepath.Join(episodeDir, "videos", shotID+".mp4")
}

func defaultEndFrameOutput(promptPath string) string {
	promptAbs, err := filepath.Abs(promptPath)
	if err != nil {
		promptAbs = promptPath
	}
	shotDir := filepath.Dir(promptAbs)
	shotID := filepath.Base(shotDir)
	episodeDir := filepath.Dir(filepath.Dir(shotDir))
	return filepath.Join(episodeDir, "end-frames", shotID+"_end.png")
}

func printValidationResults(ok bool, results []validate.Result) {
	for _, item := range results {
		status := "OK"
		if !item.OK {
			status = "FAIL"
		}
		source := ""
		if item.Source != "" {
			source = " <= " + item.Source
		}
		fmt.Printf("  %s [%s] %s%s\n", status, item.Expected, item.URL, source)
		if item.OK {
			sizeText := "unknown"
			if item.Size != nil {
				sizeText = fmt.Sprintf("%d bytes", *item.Size)
			}
			fmt.Printf("     Content-Type: %s | Size: %s\n", item.ContentType, sizeText)
		} else {
			fmt.Printf("     Error: %s\n", item.Error)
		}
	}
	if ok {
		fmt.Printf("\nOK: all %d URL checks passed\n", len(results))
		return
	}
	failed := 0
	for _, item := range results {
		if !item.OK {
			failed++
		}
	}
	fmt.Fprintf(os.Stderr, "\nFAIL: %d/%d URL checks failed; block generation\n", failed, len(results))
}

func printJSON(value any) {
	raw, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
		return
	}
	fmt.Println(string(raw))
}

func printUsage() {
	fmt.Fprintln(os.Stderr, `usage: videoctl <command> [args]

commands:
  upload                upload local media and write .url sidecars
  payload               build gateway JSON from prompt.md
  validate              validate prompt media URLs
  submit                submit or dry-run a prompt
  status                read a local run directory state
  download              download a generated video URL
  extract-end-frame     extract one frame near video end
  extract-candidates    extract spatial-reference candidate frames
  select-spatial-frame  copy the selected spatial reference frame
  run-shot              submit, wait, and optionally download/postprocess`)
}
