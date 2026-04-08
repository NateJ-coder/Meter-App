Attribute VB_Name = "G_WCU_Out"
' OUTPUT FOR BCM %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
Sub WCU_Output()

 
'  This Routine prepares the data in a format which is acceptable to WCU Trac for import to produce Invoices
 
    ' Output Units
    Dim OutputText As String
    Dim ElecTarrif As Double
  
    ' Clear Sheet ----------------------------------
    Sheets("WCU Output").Visible = True
    Sheets("WCU Output").Activate
    
    Sheets("WCU Output").Range("A3:E1000").ClearFormats
    Sheets("WCU Output").Range("A3:E1000").ClearContents
    Columns("A:E").HorizontalAlignment = xlCenter
    Range("D1").HorizontalAlignment = xlLeft

    ' Sets up some titles for readability purposes only
    Sheets("WCU Output").Cells(1, 2) = "WCU EXPORT FORMAT"
    Sheets("WCU Output").Cells(1, 4) = BuildingName & " : " & SelDate
    Sheets("WCU Output").Cells(2, 1) = "DOOR NO"
    Sheets("WCU Output").Cells(2, 2) = "OPENING READING"
    
    Sheets("WCU Output").Cells(2, 3) = "CLOSING READING"
    Sheets("WCU Output").Cells(2, 4) = "CONSUMPTION"
    Sheets("WCU Output").Cells(2, 5) = "DEBIT AMOUNT"

' #### Read Checkbox results to decide what to INCLUDE ###########

    ThisRow = 2: ThisCol = 8: IncludeElectricityConsumption = Sheets("WCU Output").Cells(ThisRow, ThisCol)
    ThisRow = ThisRow + 1: IncludeWaterConsumption = Sheets("WCU Output").Cells(ThisRow, ThisCol)
    
    ThisRow = ThisRow + 1: IncludeElecCommonProp = Sheets("WCU Output").Cells(ThisRow, ThisCol)
    ThisRow = ThisRow + 1: IncludeElecServiceCharge = Sheets("WCU Output").Cells(ThisRow, ThisCol)
    ThisRow = ThisRow + 1: IncludeElecNetworkCharge = Sheets("WCU Output").Cells(ThisRow, ThisCol)
    
    ThisRow = ThisRow + 1: IncludeWaterCommonProp = Sheets("WCU Output").Cells(ThisRow, ThisCol)
    ThisRow = ThisRow + 1: IncludeWaterDemandLevy = Sheets("WCU Output").Cells(ThisRow, ThisCol)
    ThisRow = ThisRow + 1: IncludeWaterSurcharge = Sheets("WCU Output").Cells(ThisRow, ThisCol)
    
    ThisRow = ThisRow + 1: IncludeSewer = Sheets("WCU Output").Cells(ThisRow, ThisCol)
    ThisRow = ThisRow + 1: IncludeRefuse = Sheets("WCU Output").Cells(ThisRow, ThisCol)
 
 ' -----------------------------------------------------------------
 
    Dim Offset As Integer: GetOffset = 7
    LineCount = 2
     For UnitNo = 1 To ElecUnitCount
   
        ' ####################  ELECTRICITY ###########################
   
       ' IncludeElectricityConsumption ----------------------------------------------------
        If IncludeElectricityConsumption = True And PrepaidElecInstalled(UnitNo) = 0 Then
        
          If PrepaidElecInstalled(UnitNo) > 0 Then ThisAmount = 0
          
        
            LineCount = LineCount + 1
            Sheets("WCU Output").Cells((LineCount), 1) = UnitNames(UnitNo)
            Sheets("WCU Output").Cells((LineCount), 2) = ElecPrevReadings(UnitNo)
            Sheets("WCU Output").Cells((LineCount), 3) = ElecThisReadings(UnitNo)
            Sheets("WCU Output").Cells((LineCount), 4) = ElecUnitCons(UnitNo)
            Sheets("WCU Output").Cells((LineCount), 5) = Format(UnitElecCost(UnitNo), "#.00")
        End If
        
        '####################  WATER ###########################
      
          ' IncludeWaterConsumption ----------------------------------------------------
        If IncludeWaterConsumption = True And PrepaidWaterInstalled(i) = 0 Then
            LineCount = LineCount + 1
            Sheets("WCU Output").Cells((LineCount), 1) = UnitNames(UnitNo)
            Sheets("WCU Output").Cells((LineCount), 2) = WaterPrevReadings(UnitNo)
            Sheets("WCU Output").Cells((LineCount), 3) = WaterThisReadings(UnitNo)
            Sheets("WCU Output").Cells((LineCount), 4) = WaterUnitCons(UnitNo)
            Sheets("WCU Output").Cells((LineCount), 5) = Format(UnitWaterCost(UnitNo), "#.00")
        End If
        
       ' ####################  ELECTRICITY EXTRAS ###########################
        
      ' IncludeElecCommonProp ----------------------------------------------------
        If IncludeElecCommonProp = True Then
            LineCount = LineCount + 1
            Sheets("WCU Output").Cells((LineCount), 1) = UnitNames(UnitNo)
            Sheets("WCU Output").Cells((LineCount), 2) = OptionText1
            Sheets("WCU Output").Cells((LineCount), 3) = PrevDate
            Sheets("WCU Output").Cells((LineCount), 4) = SelDate
            Sheets("WCU Output").Cells((LineCount), 5) = Format(ElecBulkDiff(UnitNo), "#.00")
        End If
        
      ' IncludeElecServiceCharge ----------------------------------------------------
        If IncludeElecServiceCharge = True Then
          LineCount = LineCount + 1
            Sheets("WCU Output").Cells((LineCount), 1) = UnitNames(UnitNo)
            Sheets("WCU Output").Cells((LineCount), 2) = OptionText2
            Sheets("WCU Output").Cells((LineCount), 3) = PrevDate
            Sheets("WCU Output").Cells((LineCount), 4) = SelDate
            Sheets("WCU Output").Cells((LineCount), 5) = Format(OptionCharge2(UnitNo), "#.00")
        End If
        
      ' IncludeElecNetworkCharge ----------------------------------------------------
        If IncludeElecNetworkCharge = True Then
            LineCount = LineCount + 1
            Sheets("WCU Output").Cells((LineCount), 1) = UnitNames(UnitNo)
            Sheets("WCU Output").Cells((LineCount), 2) = OptionText3
            Sheets("WCU Output").Cells((LineCount), 3) = PrevDate
            Sheets("WCU Output").Cells((LineCount), 4) = SelDate
            Sheets("WCU Output").Cells((LineCount), 5) = Format(OptionCharge3(UnitNo), "#.00")
        End If
        
        '####################  WATER EXTRAS ###########################
        
      ' IncludeWaterCommonProp ----------------------------------------------------
        If IncludeWaterCommonProp = True Then
            LineCount = LineCount + 1
            Sheets("WCU Output").Cells((LineCount), 1) = UnitNames(UnitNo)
            Sheets("WCU Output").Cells((LineCount), 2) = OptionText4
            Sheets("WCU Output").Cells((LineCount), 3) = PrevDate
            Sheets("WCU Output").Cells((LineCount), 4) = SelDate
            Sheets("WCU Output").Cells((LineCount), 5) = Format(WaterBulkDiff(UnitNo), "#.00")
        End If
        
         ' IncludeWaterDemandLevy ----------------------------------------------------
        If IncludeWaterDemandLevy = True Then
            LineCount = LineCount + 1
            Sheets("WCU Output").Cells((LineCount), 1) = UnitNames(UnitNo)
            Sheets("WCU Output").Cells((LineCount), 2) = OptionText5
            Sheets("WCU Output").Cells((LineCount), 3) = PrevDate
            Sheets("WCU Output").Cells((LineCount), 4) = SelDate
            Sheets("WCU Output").Cells((LineCount), 5) = Format(OptionCharge5(UnitNo), "#.00")
        End If
        
      ' IncludeWaterSurcharge ----------------------------------------------------
        If IncludeWaterSurcharge = True Then
            LineCount = LineCount + 1
            Sheets("WCU Output").Cells((LineCount), 1) = UnitNames(UnitNo)
            Sheets("WCU Output").Cells((LineCount), 2) = OptionText6
            Sheets("WCU Output").Cells((LineCount), 3) = PrevDate
            Sheets("WCU Output").Cells((LineCount), 4) = SelDate
            Sheets("WCU Output").Cells((LineCount), 5) = Format(OptionCharge6(UnitNo), "#.00")
        End If

      ' SANITATION ----------------------------------------------------
        If IncludeSewer = True Then
            LineCount = LineCount + 1
            Sheets("WCU Output").Cells((LineCount), 1) = UnitNames(UnitNo)
            Sheets("WCU Output").Cells((LineCount), 2) = OptionText7
            Sheets("WCU Output").Cells((LineCount), 3) = PrevDate
            Sheets("WCU Output").Cells((LineCount), 4) = SelDate
            Sheets("WCU Output").Cells((LineCount), 5) = Format(OptionCharge7(UnitNo), "#.00")
        End If
        
        ' Refuse ----------------------------------------------------
        If IncludeRefuse = True Then
            LineCount = LineCount + 1
            Sheets("WCU Output").Cells((LineCount), 1) = UnitNames(UnitNo)
            Sheets("WCU Output").Cells((LineCount), 2) = OptionText8
            Sheets("WCU Output").Cells((LineCount), 3) = PrevDate
            Sheets("WCU Output").Cells((LineCount), 4) = SelDate
            Sheets("WCU Output").Cells((LineCount), 5) = Format(OptionCharge8(UnitNo), "#.00")
        End If
        Sheets("WCU Output").Range(Cells(LineCount, 1), Cells(LineCount, 5)).Borders(xlEdgeBottom).LineStyle = xlContinuous
     Next

 End Sub

Sub CheckAllWCU()

    Dim Check As Boolean

    Check = Sheets("WCU Output").Range("H2")
    If Check = True Then
        Check = False
        Else
        Check = True
    End If
    
    Sheets("WCU Output").Range("H2") = Check
    Sheets("WCU Output").Range("H3") = Check
    Sheets("WCU Output").Range("H4") = Check
    Sheets("WCU Output").Range("H5") = Check
    Sheets("WCU Output").Range("H6") = Check
    Sheets("WCU Output").Range("H7") = Check
    Sheets("WCU Output").Range("H8") = Check
    Sheets("WCU Output").Range("H9") = Check
    Sheets("WCU Output").Range("H10") = Check
    Sheets("WCU Output").Range("H11") = Check
    
    WCU_Output
    
End Sub
