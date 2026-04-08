Attribute VB_Name = "T_Tolorance"
Sub ToloranceCheck()
    
    Dim cmt As Comment
    SheetName = ActiveSheet.Name   ' Get Current Sheet
    RemCol = ActiveCell.Column
    RemRow = ActiveCell.Row
    
    If RemRow <> 1 Then MsgBox ("Please select a Date from the top row"): Exit Sub
    
    ErrorTolPercentage = Sheets("Settings").Range("ErrorTolPercentage")
    ErrorCheckMonths = Sheets("Settings").Range("ErrorCheckMonths")
    ErrorTolColor = Sheets("Settings").Range("ErrorTolColor").Interior.Color
    
    If RemCol - ErrorCheckMonths < 5 Then
        MsgBox ("Not enough recorded history to process from this date, with the current settings")
        Exit Sub
    End If
 
    ThisCell = "Electricity"
    ThisCol = 1
    Index = FindRow(ThisCol, "Electricity") + 1
    
    While ThisCell <> ""                        ' Continue until a blank cell is reached to mark the end of the data
 
        ThisReading = CDbl(Cells(Index, RemCol))
        If Cells(Index, RemCol) <> "" Then
            PrevReading1 = Cells(Index, RemCol - 1)
            ThisMonthsUsage = Int(ThisReading - PrevReading1)
            
            PastMonthlyReadings = ""
            
            If RemCol - ErrorCheckMonths < 5 Then
               ' ErrorCheckMonths = RemCol - 4
                MsgBox ("Not enough recorded data for this request")
                Exit Sub
            End If
            
            For i = RemCol - ErrorCheckMonths To RemCol - 1
                CellA = Cells(Index, i)
                CellB = Cells(Index, i - 1)
            
                UnitsUsed = CellA - CellB
                If PastMonthlyReadings = "" Then
                    PastMonthlyReadings = UnitsUsed
                Else
                    PastMonthlyReadings = PastMonthlyReadings & "," & UnitsUsed
                End If
                
            Next i
            
            PrevReading2 = Cells(Index, RemCol - ErrorCheckMonths - 1)
            PastUsage = PrevReading1 - PrevReading2
            PastAverage = Int(PastUsage / ErrorCheckMonths)
            
            ThisComment = "Past " & ErrorCheckMonths & " months:" & vbCrLf & PastMonthlyReadings & vbCrLf & "Average: " & PastAverage & vbCrLf & "Current: " & ThisMonthsUsage
                           
            Set cmt = Sheets(SheetName).Cells(Index, RemCol).Comment
            If cmt Is Nothing Then
              Sheets(SheetName).Cells(Index, RemCol).AddComment Text:=ThisComment
              Else
              Sheets(SheetName).Cells(Index, RemCol).Comment.Text Text:=ThisComment
        
            End If
          
            TolMin = Int(PastAverage * (1 - ErrorTolPercentage))
            TolMax = Int(PastAverage * (1 + ErrorTolPercentage))
            
            If ThisMonthsUsage < TolMax And ThisMonthsUsage > TolMin Then
                Sheets(SheetName).Cells(Index, RemCol).Interior.Color = xlNone
            Else
                Sheets(SheetName).Cells(Index, RemCol).Interior.Color = ErrorTolColor
            End If
            
        End If
        Index = Index + 1
        ThisCell = Cells(Index, 1)  ' Reads the next line down the list
    Wend
    
    MsgBox ("Tolerance Check Done, See Comments in each Cell")

End Sub


