import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CopyableCode } from '../../components/CopyableCode';

// Mock clipboard API
const mockWriteText = jest.fn();
Object.assign(navigator, {
  clipboard: {
    writeText: mockWriteText,
  },
});

describe('CopyableCode Component', () => {
  beforeEach(() => {
    mockWriteText.mockClear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders code snippet correctly', () => {
    render(<CopyableCode code="test-code" />);
    expect(screen.getByText('test-code')).toBeInTheDocument();
  });

  it('copies to clipboard on click', async () => {
    mockWriteText.mockResolvedValue(undefined);
    render(<CopyableCode code="test-code" />);

    const codeElement = screen.getByText('test-code');

    await React.act(async () => {
      fireEvent.click(codeElement);
    });

    expect(mockWriteText).toHaveBeenCalledWith('test-code');

    // Check for success feedback
    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeInTheDocument();
    });
  });

  it('copies to clipboard on keyboard interaction (Enter)', async () => {
    mockWriteText.mockResolvedValue(undefined);
    render(<CopyableCode code="test-code" />);

    const codeElement = screen.getByText('test-code');
    codeElement.focus();

    await React.act(async () => {
      fireEvent.keyDown(codeElement, { key: 'Enter', code: 'Enter' });
    });

    expect(mockWriteText).toHaveBeenCalledWith('test-code');
  });

  it('copies to clipboard on keyboard interaction (Space)', async () => {
    mockWriteText.mockResolvedValue(undefined);
    render(<CopyableCode code="test-code" />);

    const codeElement = screen.getByText('test-code');
    codeElement.focus();

    await React.act(async () => {
      fireEvent.keyDown(codeElement, { key: ' ', code: 'Space' });
    });

    expect(mockWriteText).toHaveBeenCalledWith('test-code');
  });

  it('removes success feedback after delay', async () => {
    mockWriteText.mockResolvedValue(undefined);
    render(<CopyableCode code="test-code" />);

    const codeElement = screen.getByText('test-code');

    await React.act(async () => {
      fireEvent.click(codeElement);
    });

    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeInTheDocument();
    });

    // Advance timers
    React.act(() => {
        jest.advanceTimersByTime(2000);
    });

    await waitFor(() => {
      expect(screen.queryByText('Copied!')).not.toBeInTheDocument();
    });
  });

  it('has correct accessibility attributes', () => {
    render(<CopyableCode code="test-code" />);
    const codeElement = screen.getByRole('button');

    expect(codeElement).toHaveAttribute('tabIndex', '0');
    expect(codeElement).toHaveAttribute('aria-label', 'Copy code: test-code');
  });
});
