"""
Signal Formatter - Polymorphic signal message generator
Formats trading signals from all indicators for notifications (Telegram, Email, etc.)
"""

from typing import Dict, List, Optional


class SignalFormatter:
    """
    Polymorphic signal formatter that generates formatted messages
    for different notification channels (Telegram, Email, SMS, etc.)
    """
    
    @staticmethod
    def format_indicator_value(value: any, decimals: int = 6) -> str:
        """Format indicator value with proper decimals"""
        if value is None:
            return "N/A"
        if isinstance(value, (int, float)):
            return f"{value:.{decimals}f}"
        return str(value)
    
    @staticmethod
    def format_telegram_message(symbol_data: dict) -> str:
        """
        Format comprehensive signal message for Telegram
        
        Args:
            symbol_data: Dictionary with symbol, price, indicators, and signals
            
        Returns:
            Formatted HTML message for Telegram
        """
        symbol = symbol_data.get('symbol', 'UNKNOWN')
        price = symbol_data.get('last_price', 0)
        buy_signals = symbol_data.get('buy_signals', [])
        sell_signals = symbol_data.get('sell_signals', [])
        daily_indicators = symbol_data.get('daily_indicators', {})
        hourly_indicators = symbol_data.get('hourly_indicators', {})
        
        # Determine overall signal
        signal_count = len(buy_signals) - len(sell_signals)
        if signal_count > 0:
            emoji = "🟢"
            overall = "BULLISH"
        elif signal_count < 0:
            emoji = "🔴"
            overall = "BEARISH"
        else:
            emoji = "⚪"
            overall = "NEUTRAL"
        
        # Build message
        message_parts = [
            f"{emoji} <b>{symbol}</b> - {overall}",
            f"💰 Price: <b>${SignalFormatter.format_indicator_value(price, 6)}</b>",
            ""
        ]
        
        # Buy signals
        if buy_signals:
            message_parts.append(f"🟢 <b>BUY Signals ({len(buy_signals)}):</b>")
            for sig in buy_signals:
                message_parts.append(f"  • {SignalFormatter._format_signal_name(sig)}")
            message_parts.append("")
        
        # Sell signals
        if sell_signals:
            message_parts.append(f"🔴 <b>SELL Signals ({len(sell_signals)}):</b>")
            for sig in sell_signals:
                message_parts.append(f"  • {SignalFormatter._format_signal_name(sig)}")
            message_parts.append("")
        
        # Key indicator values
        if daily_indicators or hourly_indicators:
            message_parts.append("📊 <b>Key Indicators:</b>")
            
            # Bollinger Bands
            if daily_indicators.get('bollinger_band'):
                bb = daily_indicators['bollinger_band']
                message_parts.append(
                    f"  BB(20): U:{SignalFormatter.format_indicator_value(bb.get('upper_band'), 6)} "
                    f"M:{SignalFormatter.format_indicator_value(bb.get('middle_band'), 6)} "
                    f"L:{SignalFormatter.format_indicator_value(bb.get('lower_band'), 6)}"
                )
            
            # RSI
            if daily_indicators.get('rsi_9'):
                rsi = daily_indicators['rsi_9'].get('rsi_value')
                message_parts.append(f"  RSI(9): {SignalFormatter.format_indicator_value(rsi, 2)}")
            
            # SMA 50
            if daily_indicators.get('sma_50'):
                sma50 = daily_indicators['sma_50'].get('sma_value')
                message_parts.append(f"  SMA(50): {SignalFormatter.format_indicator_value(sma50, 6)}")
            
            # MACD
            if daily_indicators.get('macd'):
                macd = daily_indicators['macd']
                macd_line = macd.get('macd_line')
                signal_line = macd.get('signal_line')
                message_parts.append(
                    f"  MACD: {SignalFormatter.format_indicator_value(macd_line, 6)} / "
                    f"{SignalFormatter.format_indicator_value(signal_line, 6)}"
                )
            
            # EMA 100 Hourly
            if hourly_indicators.get('ema_100'):
                ema100 = hourly_indicators['ema_100'].get('ema_value')
                message_parts.append(f"  EMA(100)H: {SignalFormatter.format_indicator_value(ema100, 6)}")
        
        message_parts.append("")
        message_parts.append("📈 Check dashboard for full analysis!")
        
        return "\n".join(message_parts)
    
    @staticmethod
    def format_signal_change_message(symbol_data: dict, previous_data: dict) -> str:
        """
        Format message for signal changes (when signals appear/disappear)
        
        Args:
            symbol_data: Current symbol data with new signals
            previous_data: Previous symbol data for comparison
            
        Returns:
            Formatted message highlighting changes
        """
        symbol = symbol_data.get('symbol', 'UNKNOWN')
        price = symbol_data.get('last_price', 0)
        
        # Get signal changes
        new_buy = set(symbol_data.get('buy_signals', []))
        old_buy = set(previous_data.get('buy_signals', []))
        new_sell = set(symbol_data.get('sell_signals', []))
        old_sell = set(previous_data.get('sell_signals', []))
        
        added_buy = new_buy - old_buy
        removed_buy = old_buy - new_buy
        added_sell = new_sell - old_sell
        removed_sell = old_sell - new_sell
        
        # Determine alert type
        if added_buy or added_sell:
            emoji = "🔔"
            alert_type = "NEW SIGNALS"
        else:
            emoji = "🔄"
            alert_type = "SIGNAL UPDATE"
        
        message_parts = [
            f"{emoji} <b>{alert_type}: {symbol}</b>",
            f"💰 Price: <b>${SignalFormatter.format_indicator_value(price, 6)}</b>",
            ""
        ]
        
        # New buy signals
        if added_buy:
            message_parts.append("🟢 <b>NEW BUY Signals:</b>")
            for sig in added_buy:
                message_parts.append(f"  ✅ {SignalFormatter._format_signal_name(sig)}")
            message_parts.append("")
        
        # New sell signals
        if added_sell:
            message_parts.append("🔴 <b>NEW SELL Signals:</b>")
            for sig in added_sell:
                message_parts.append(f"  ✅ {SignalFormatter._format_signal_name(sig)}")
            message_parts.append("")
        
        # Removed signals
        if removed_buy:
            message_parts.append("❌ <b>Cleared BUY Signals:</b>")
            for sig in removed_buy:
                message_parts.append(f"  • {SignalFormatter._format_signal_name(sig)}")
            message_parts.append("")
        
        if removed_sell:
            message_parts.append("❌ <b>Cleared SELL Signals:</b>")
            for sig in removed_sell:
                message_parts.append(f"  • {SignalFormatter._format_signal_name(sig)}")
            message_parts.append("")
        
        # Current status
        current_buy = list(new_buy)
        current_sell = list(new_sell)
        
        if current_buy:
            message_parts.append(f"📊 Active BUY: {len(current_buy)} signal(s)")
        if current_sell:
            message_parts.append(f"📊 Active SELL: {len(current_sell)} signal(s)")
        
        return "\n".join(message_parts)
    
    @staticmethod
    def format_summary_message(watchlist_data: List[dict]) -> str:
        """
        Format summary message for all symbols
        
        Args:
            watchlist_data: List of all symbols with their data
            
        Returns:
            Formatted summary message
        """
        total_symbols = len(watchlist_data)
        buy_count = sum(1 for s in watchlist_data if s.get('buy_signals'))
        sell_count = sum(1 for s in watchlist_data if s.get('sell_signals'))
        neutral_count = total_symbols - buy_count - sell_count
        
        message_parts = [
            "📊 <b>Trading Signals Summary</b>",
            "",
            f"Total Pairs: {total_symbols}",
            f"🟢 With BUY signals: {buy_count}",
            f"🔴 With SELL signals: {sell_count}",
            f"⚪ Neutral: {neutral_count}",
            ""
        ]
        
        # Top movers by signal count
        sorted_symbols = sorted(
            watchlist_data,
            key=lambda x: len(x.get('buy_signals', [])) + len(x.get('sell_signals', [])),
            reverse=True
        )[:5]
        
        if sorted_symbols:
            message_parts.append("<b>Top Active Pairs:</b>")
            for symbol_data in sorted_symbols:
                symbol = symbol_data.get('symbol', 'UNKNOWN')
                buy_sigs = len(symbol_data.get('buy_signals', []))
                sell_sigs = len(symbol_data.get('sell_signals', []))
                if buy_sigs > 0 or sell_sigs > 0:
                    message_parts.append(f"  • {symbol}: 🟢{buy_sigs} 🔴{sell_sigs}")
        
        return "\n".join(message_parts)
    
    @staticmethod
    def _format_signal_name(signal_name: str) -> str:
        """Format signal name for better readability"""
        # Replace underscores with spaces
        formatted = signal_name.replace('_', ' ')
        return formatted
    
    @staticmethod
    def format_email_message(symbol_data: dict) -> Dict[str, str]:
        """
        Format signal message for Email
        
        Returns:
            Dictionary with 'subject' and 'body' keys
        """
        symbol = symbol_data.get('symbol', 'UNKNOWN')
        buy_signals = symbol_data.get('buy_signals', [])
        sell_signals = symbol_data.get('sell_signals', [])
        
        # Determine subject
        if buy_signals and not sell_signals:
            subject = f"🟢 BUY Signal Alert: {symbol}"
        elif sell_signals and not buy_signals:
            subject = f"🔴 SELL Signal Alert: {symbol}"
        else:
            subject = f"⚠️ Mixed Signals: {symbol}"
        
        # Use telegram format for body (works for email too)
        body = SignalFormatter.format_telegram_message(symbol_data)
        # Convert HTML tags for email
        body = body.replace('<b>', '**').replace('</b>', '**')
        
        return {
            'subject': subject,
            'body': body
        }
    
    @staticmethod
    def format_plain_text(symbol_data: dict) -> str:
        """
        Format signal message as plain text (for SMS, console, etc.)
        
        Returns:
            Plain text message without formatting
        """
        symbol = symbol_data.get('symbol', 'UNKNOWN')
        price = symbol_data.get('last_price', 0)
        buy_signals = symbol_data.get('buy_signals', [])
        sell_signals = symbol_data.get('sell_signals', [])
        
        message_parts = [
            f"{symbol} @ ${SignalFormatter.format_indicator_value(price, 6)}",
        ]
        
        if buy_signals:
            message_parts.append(f"BUY: {', '.join(buy_signals)}")
        
        if sell_signals:
            message_parts.append(f"SELL: {', '.join(sell_signals)}")
        
        if not buy_signals and not sell_signals:
            message_parts.append("No active signals")
        
        return " | ".join(message_parts)
