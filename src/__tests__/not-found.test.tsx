import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import NotFound from "../app/not-found";

describe("NotFound Page", () => {
  it("renders the 404 heading", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { level: 1, name: "404" })).toBeInTheDocument();
  });

  it("renders the thematic message", () => {
    render(<NotFound />);
    expect(screen.getByText("The trace you are following has dissolved.")).toBeInTheDocument();
  });

  it("renders the return link", () => {
    render(<NotFound />);
    const link = screen.getByRole("link", { name: /return to source/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/");
  });
});
