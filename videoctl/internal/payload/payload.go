package payload

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/cdotlock/assets-produce/videoctl/internal/assets"
	"github.com/cdotlock/assets-produce/videoctl/internal/prompt"
)

const (
	DefaultRatio      = "9:16"
	DefaultResolution = "720P"
)

type Options struct {
	ProjectRoot   string
	AllowNonOSS   bool
	AllowTextOnly bool
}

func Build(promptPath string, opts Options) (map[string]any, error) {
	doc, err := prompt.ParseFile(promptPath)
	if err != nil {
		return nil, err
	}
	return BuildFromDocument(doc, opts)
}

func BuildFromDocument(doc *prompt.Document, opts Options) (map[string]any, error) {
	imageRefs := collectPayloadImageRefs(doc.Frontmatter)
	videoRefs := collectPayloadVideoRefs(doc.Frontmatter)

	imageURLs := make([]string, 0, len(imageRefs))
	for _, ref := range imageRefs {
		resolved, err := assets.ResolveAssetURL(ref, "image", opts.ProjectRoot, opts.AllowNonOSS)
		if err != nil {
			return nil, err
		}
		imageURLs = append(imageURLs, resolved)
	}

	videoURLs := make([]string, 0, len(videoRefs))
	for _, ref := range videoRefs {
		resolved, err := assets.ResolveAssetURL(ref, "video", opts.ProjectRoot, opts.AllowNonOSS)
		if err != nil {
			return nil, err
		}
		videoURLs = append(videoURLs, resolved)
	}

	if previousFrame, ok := assets.StringValue(doc.Frontmatter["previous_frame_url"]); ok {
		resolved, err := assets.ResolveAssetURL(previousFrame, "previous_frame_url", opts.ProjectRoot, opts.AllowNonOSS)
		if err != nil {
			return nil, err
		}
		imageURLs = appendUnique(imageURLs, resolved)
	}

	if previousVideo, ok := assets.StringValue(doc.Frontmatter["previous_video_url"]); ok {
		resolved, err := assets.ResolveAssetURL(previousVideo, "previous_video_url", opts.ProjectRoot, opts.AllowNonOSS)
		if err != nil {
			return nil, err
		}
		videoURLs = appendUnique(videoURLs, resolved)
	}

	if len(imageURLs) == 0 && !opts.AllowTextOnly {
		return nil, fmt.Errorf("no image OSS URL found. The gateway workflow requires at least one source image URL; upload assets and fill assets.images first")
	}

	duration, err := parseDuration(doc.Frontmatter["duration"])
	if err != nil {
		return nil, err
	}

	out := map[string]any{
		"action":     "generate",
		"prompt":     doc.Body,
		"duration":   duration,
		"ratio":      stringDefault(doc.Frontmatter["ratio"], DefaultRatio),
		"resolution": stringDefault(doc.Frontmatter["resolution"], DefaultResolution),
	}

	if len(imageURLs) > 0 {
		out["sourceImageUrl"] = imageURLs[0]
		if len(imageURLs) > 1 {
			out["referenceImageUrls"] = imageURLs[1:]
		}
	}

	if len(videoURLs) > 0 {
		out["sourceVideoUrls"] = videoURLs
	}

	if value, ok := doc.Frontmatter["continuation_tail_seconds"]; ok && value != nil {
		tailSeconds, err := parseDuration(value)
		if err != nil {
			return nil, err
		}
		out["continuationTailSeconds"] = tailSeconds
	}

	return out, nil
}

func collectPayloadImageRefs(frontmatter map[string]any) []string {
	var refs []string
	for _, field := range []string{"first_frame", "last_frame"} {
		if value, ok := assets.StringValue(frontmatter[field]); ok {
			refs = append(refs, value)
		}
	}

	assetMap := assets.MapValue(frontmatter["assets"])
	refs = append(refs, assets.StringSlice(assetMap["images"])...)
	return refs
}

func collectPayloadVideoRefs(frontmatter map[string]any) []string {
	assetMap := assets.MapValue(frontmatter["assets"])
	return assets.StringSlice(assetMap["videos"])
}

func parseDuration(value any) (int, error) {
	if value == nil {
		return 12, nil
	}

	switch typed := value.(type) {
	case int:
		return typed, nil
	case int64:
		return int(typed), nil
	case string:
		raw := strings.TrimSpace(strings.ToLower(typed))
		raw = strings.TrimSuffix(raw, "s")
		return strconv.Atoi(raw)
	default:
		return 12, nil
	}
}

func stringDefault(value any, fallback string) string {
	text, ok := assets.StringValue(value)
	if !ok {
		return fallback
	}
	return text
}

func appendUnique(values []string, value string) []string {
	for _, existing := range values {
		if existing == value {
			return values
		}
	}
	return append(values, value)
}
