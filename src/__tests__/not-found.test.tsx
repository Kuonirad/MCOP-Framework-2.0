import { render, screen } from "@testing-library/react";
import NotFound from "../app/not-found";

describe("NotFound Page", () => {
  it("renders the 404 heading", () => {
    render(<NotFound />);
    const heading = screen.getByRole("heading", { level: 1, name: /404/i });
    expect(heading).toBeInTheDocument();
  });

  it("displays the thematic error message", () => {
    render(<NotFound />);
    const message = screen.getByText(/The trace you are following has dissolved/i);
    expect(message).toBeInTheDocument();
  });

  it("contains a link to return home", () => {
    render(<NotFound />);
    const link = screen.getByRole("link", { name: /Return to Source/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/");
  });
});
