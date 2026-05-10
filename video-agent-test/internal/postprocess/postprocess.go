package postprocess

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"time"
)

func ExtractEndFrame(ctx context.Context, video string, output string, offsetSeconds float64) error {
	videoPath, outputPath, err := normalizeVideoOutput(video, output)
	if err != nil {
		return err
	}
	return runFFmpeg(ctx,
		"-y",
		"-hide_banner",
		"-loglevel", "error",
		"-sseof", fmt.Sprintf("-%g", offsetSeconds),
		"-i", videoPath,
		"-frames:v", "1",
		"-q:v", "2",
		outputPath,
	)
}

func ExtractCandidates(ctx context.Context, video string, outDir string, shotID string, intervalSeconds float64) ([]string, error) {
	videoPath, err := filepath.Abs(video)
	if err != nil {
		return nil, err
	}
	if _, err := os.Stat(videoPath); err != nil {
		return nil, err
	}
	outPath, err := filepath.Abs(outDir)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(outPath, 0o755); err != nil {
		return nil, err
	}
	if shotID == "" {
		shotID = trimExt(filepath.Base(videoPath))
	}
	pattern := filepath.Join(outPath, fmt.Sprintf("%s_cand_%%02d.png", shotID))
	if err := runFFmpeg(ctx,
		"-y",
		"-hide_banner",
		"-loglevel", "error",
		"-i", videoPath,
		"-vf", fmt.Sprintf("fps=1/%g", intervalSeconds),
		"-q:v", "2",
		pattern,
	); err != nil {
		return nil, err
	}
	outputs, err := filepath.Glob(filepath.Join(outPath, fmt.Sprintf("%s_cand_*.png", shotID)))
	if err != nil {
		return nil, err
	}
	sort.Strings(outputs)
	return outputs, nil
}

func SelectSpatialFrame(candidate string, output string) error {
	candidatePath, err := filepath.Abs(candidate)
	if err != nil {
		return err
	}
	if _, err := os.Stat(candidatePath); err != nil {
		return err
	}
	outputPath, err := filepath.Abs(output)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(outputPath), 0o755); err != nil {
		return err
	}
	raw, err := os.ReadFile(candidatePath)
	if err != nil {
		return err
	}
	return os.WriteFile(outputPath, raw, 0o644)
}

func normalizeVideoOutput(video string, output string) (string, string, error) {
	videoPath, err := filepath.Abs(video)
	if err != nil {
		return "", "", err
	}
	if _, err := os.Stat(videoPath); err != nil {
		return "", "", err
	}
	outputPath, err := filepath.Abs(output)
	if err != nil {
		return "", "", err
	}
	if err := os.MkdirAll(filepath.Dir(outputPath), 0o755); err != nil {
		return "", "", err
	}
	return videoPath, outputPath, nil
}

func runFFmpeg(ctx context.Context, args ...string) error {
	ffmpeg := os.Getenv("FFMPEG")
	if ffmpeg == "" {
		ffmpeg = "ffmpeg"
	}
	runCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()
	cmd := exec.CommandContext(runCtx, ffmpeg, args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		if len(output) > 0 {
			return fmt.Errorf("%w: %s", err, string(output))
		}
		return err
	}
	return nil
}

func trimExt(name string) string {
	ext := filepath.Ext(name)
	return name[:len(name)-len(ext)]
}
