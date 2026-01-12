package pdf

import (
	"bytes"
	"fmt"
	"strings"
)

// BuildSimplePDF creates a minimal PDF document for plain text lines.
func BuildSimplePDF(lines []string) []byte {
	content := buildPDFContent(lines)

	var buf bytes.Buffer
	offsets := make([]int, 6)

	writeObj := func(index int, body string) {
		offsets[index] = buf.Len()
		fmt.Fprintf(&buf, "%d 0 obj\n%s\nendobj\n", index, body)
	}

	writeObj(1, "<< /Type /Catalog /Pages 2 0 R >>")
	writeObj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
	writeObj(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>")
	writeObj(4, fmt.Sprintf("<< /Length %d >>\nstream\n%s\nendstream", len(content), content))
	writeObj(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

	xrefOffset := buf.Len()
	fmt.Fprintf(&buf, "xref\n0 %d\n", len(offsets))
	fmt.Fprint(&buf, "0000000000 65535 f \n")
	for i := 1; i < len(offsets); i++ {
		fmt.Fprintf(&buf, "%010d 00000 n \n", offsets[i])
	}
	fmt.Fprintf(&buf, "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF", len(offsets), xrefOffset)

	return buf.Bytes()
}

func buildPDFContent(lines []string) string {
	var builder strings.Builder
	builder.WriteString("BT /F1 12 Tf 16 TL 72 720 Td ")
	for i, line := range lines {
		if i > 0 {
			builder.WriteString("T* ")
		}
		builder.WriteString("(" + escapePDFText(line) + ") Tj ")
	}
	builder.WriteString("ET")
	return builder.String()
}

func escapePDFText(value string) string {
	replacer := strings.NewReplacer("\\", "\\\\", "(", "\\(", ")", "\\)")
	return replacer.Replace(value)
}
