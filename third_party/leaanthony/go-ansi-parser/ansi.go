package ansi

type Rgb struct {
	R uint8 `json:"r"`
	G uint8 `json:"g"`
	B uint8 `json:"b"`
}

type Col struct {
	Hex string `json:"hex"`
	Rgb Rgb    `json:"rgb"`
}

type TextStyle int

type StyledText struct {
	Label string    `json:"label"`
	FgCol *Col      `json:"fgCol,omitempty"`
	BgCol *Col      `json:"bgCol,omitempty"`
	Style TextStyle `json:"style"`
}

func Parse(input string) ([]*StyledText, error) {
	if input == "" {
		return nil, nil
	}

	return []*StyledText{{Label: input}}, nil
}
