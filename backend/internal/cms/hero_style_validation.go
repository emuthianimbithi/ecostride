package cms

import (
	"encoding/json"
	"errors"
	"regexp"
	"strings"
)

var heroStyleKeyRe = regexp.MustCompile(`^[a-z0-9]+(?:[a-z0-9_-]*[a-z0-9])?$`)

func validateHeroStyleRequest(req heroStyleRequest) error {
	if strings.TrimSpace(req.Name) == "" {
		return errors.New("name is required")
	}
	key := strings.TrimSpace(req.Key)
	if key == "" {
		return errors.New("key is required")
	}
	if !heroStyleKeyRe.MatchString(key) {
		return errors.New("key must be lowercase and machine-friendly (letters/numbers/_/-)")
	}
	if strings.TrimSpace(req.LayoutType) == "" {
		return errors.New("layoutType is required")
	}
	if strings.TrimSpace(req.AspectRatio) == "" {
		return errors.New("aspectRatio is required")
	}

	if len(req.Overlay) > 0 {
		var tmp any
		if err := json.Unmarshal(req.Overlay, &tmp); err != nil {
			return errors.New("overlay must be valid JSON")
		}
	}
	if len(req.FocalPoint) > 0 {
		var tmp any
		if err := json.Unmarshal(req.FocalPoint, &tmp); err != nil {
			return errors.New("focalPoint must be valid JSON")
		}
	}
	return nil
}
